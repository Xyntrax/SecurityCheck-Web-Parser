(function () {
    "use strict";

    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileInput");
    const fileList = document.getElementById("fileList");
    const fileMessage = document.getElementById("fileMessage");
    const parseBtn = document.getElementById("parseBtn");
    const processMessage = document.getElementById("processMessage");
    const emptyOutput = document.getElementById("emptyOutput");
    const generatedOutput = document.getElementById("generatedOutput");
    const markdownTab = document.getElementById("markdownTab");
    const previewTab = document.getElementById("previewTab");
    const markdownPanel = document.getElementById("markdownPanel");
    const previewPanel = document.getElementById("previewPanel");
    const markdownContent = document.getElementById("markdownContent");
    const redditPreview = document.getElementById("redditPreview");
    const copyBtn = document.getElementById("copyBtn");

    let selectedFile = null;
    let currentOutput = "";
    let processing = false;

    function setMessage(element, message, type) {
        element.textContent = message || "";
        element.hidden = !message;
        element.classList.toggle("error", type === "error");
        element.classList.toggle("success", type === "success");
    }

    function resetOutput() {
        currentOutput = "";
        markdownContent.textContent = "";
        redditPreview.replaceChildren();
        emptyOutput.hidden = false;
        generatedOutput.hidden = true;
        setActiveTab("markdown");
        copyBtn.disabled = false;
        copyBtn.querySelector("span").textContent = "COPY OUTPUT";
    }

    function renderSelectedFile() {
        fileList.replaceChildren();
        if (!selectedFile) return;

        const item = document.createElement("div");
        item.className = "file-item";

        const details = document.createElement("div");
        details.className = "file-details";

        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("class", "file-icon");
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML = '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z"/><path d="M13 3v7h7M8 15h8"/>';

        const textBlock = document.createElement("div");
        textBlock.className = "file-text";
        const name = document.createElement("div");
        name.className = "file-name";
        name.textContent = selectedFile.name;
        const meta = document.createElement("div");
        meta.className = "file-meta";
        meta.textContent = "Text report · Ready to parse";
        textBlock.append(name, meta);
        details.append(icon, textBlock);

        const removeButton = document.createElement("button");
        removeButton.className = "remove-btn";
        removeButton.type = "button";
        removeButton.setAttribute("aria-label", `Remove ${selectedFile.name}`);
        removeButton.title = "Remove file";
        removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
        removeButton.addEventListener("click", removeSelectedFile);

        item.append(details, removeButton);
        fileList.append(item);
    }

    function updateParseButton() {
        parseBtn.disabled = !selectedFile || processing;
        if (processing) {
            parseBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> PROCESSING...';
        } else if (generatedOutput.hidden) {
            parseBtn.textContent = "PARSE SECURITY CHECK";
        } else {
            parseBtn.textContent = "REPROCESS REPORT";
        }
    }

    function resetForNewFile() {
        resetOutput();
        setMessage(processMessage, "", "");
        updateParseButton();
    }

    function handleFile(file) {
        if (!file) return;
        const validExtension = /\.(txt|log)$/i.test(file.name);
        if (!validExtension) {
            setMessage(fileMessage, "Please select a SecurityCheck text log (.txt or .log).", "error");
            return;
        }
        if (file.size === 0) {
            setMessage(fileMessage, "The selected file is empty. Choose a different log.", "error");
            return;
        }
        selectedFile = file;
        setMessage(fileMessage, "", "");
        renderSelectedFile();
        resetForNewFile();
    }

    function removeSelectedFile() {
        selectedFile = null;
        fileInput.value = "";
        renderSelectedFile();
        setMessage(fileMessage, "", "");
        setMessage(processMessage, "", "");
        resetOutput();
        updateParseButton();
    }

    function setActiveTab(tabName) {
        const isMarkdown = tabName === "markdown";
        markdownTab.classList.toggle("active", isMarkdown);
        previewTab.classList.toggle("active", !isMarkdown);
        markdownTab.setAttribute("aria-selected", String(isMarkdown));
        previewTab.setAttribute("aria-selected", String(!isMarkdown));
        markdownPanel.hidden = !isMarkdown;
        previewPanel.hidden = isMarkdown;
    }

    function appendInlineMarkdown(parent, text) {
        const tokenPattern = /(\*\*.*?\*\*|\*[^*\n].*?\*|\[[^\]]+\]\([^)]+\))/g;
        let previous = 0;
        let match;

        while ((match = tokenPattern.exec(text)) !== null) {
            if (match.index > previous) {
                parent.append(document.createTextNode(text.slice(previous, match.index)));
            }
            const token = match[0];
            if (token.startsWith("**") && token.endsWith("**")) {
                const strong = document.createElement("strong");
                strong.textContent = token.slice(2, -2);
                parent.append(strong);
            } else if (token.startsWith("*") && token.endsWith("*")) {
                const emphasis = document.createElement("em");
                appendInlineMarkdown(emphasis, token.slice(1, -1));
                parent.append(emphasis);
            } else {
                const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                if (linkMatch) {
                    const label = linkMatch[1];
                    const destination = linkMatch[2].trim();
                    let parsedUrl = null;
                    try {
                        parsedUrl = new URL(destination);
                    } catch (_) {
                    }
                    if (parsedUrl && (parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:")) {
                        const link = document.createElement("a");
                        link.href = parsedUrl.href;
                        link.target = "_blank";
                        link.rel = "noopener noreferrer";
                        link.textContent = label;
                        parent.append(link);
                    } else {
                        parent.append(document.createTextNode(label));
                    }
                } else {
                    parent.append(document.createTextNode(token));
                }
            }
            previous = tokenPattern.lastIndex;
        }
        if (previous < text.length) {
            parent.append(document.createTextNode(text.slice(previous)));
        }
    }

    function renderPreview(markdown) {
        redditPreview.replaceChildren();
        const lines = markdown.split("\n");
        let list = null;

        function closeList() {
            list = null;
        }

        for (const line of lines) {
            if (!line.trim()) {
                closeList();
                const spacer = document.createElement("div");
                spacer.className = "preview-spacer";
                spacer.setAttribute("aria-hidden", "true");
                redditPreview.append(spacer);
                continue;
            }

            if (line.startsWith("* ")) {
                if (!list) {
                    list = document.createElement("ul");
                    list.className = "preview-list";
                    redditPreview.append(list);
                }
                const item = document.createElement("li");
                appendInlineMarkdown(item, line.slice(2));
                list.append(item);
                continue;
            }

            closeList();
            const paragraph = document.createElement("p");
            if (line.startsWith("**") && line.endsWith("**") && line.length >= 4) {
                paragraph.className = "preview-heading";
            } else if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
                paragraph.className = "preview-note";
            }
            appendInlineMarkdown(paragraph, line);
            redditPreview.append(paragraph);
        }
    }

    async function decodeFile(file) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
            return new TextDecoder("utf-16le").decode(bytes.subarray(2));
        }
        if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
            return new TextDecoder("utf-16be").decode(bytes.subarray(2));
        }
        if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
            return new TextDecoder("utf-8").decode(bytes.subarray(3));
        }

        try {
            return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch (_) {
            let decoded = "";
            const chunkSize = 8192;
            for (let start = 0; start < bytes.length; start += chunkSize) {
                decoded += String.fromCharCode(...bytes.subarray(start, Math.min(start + chunkSize, bytes.length)));
            }
            return decoded;
        }
    }

    async function parseSelectedFile() {
        if (!selectedFile || processing) return;
        processing = true;
        setMessage(processMessage, "", "");
        copyBtn.querySelector("span").textContent = "COPY OUTPUT";
        updateParseButton();

        try {
            const content = await decodeFile(selectedFile);
            if (!content.trim()) throw new Error("The selected file does not contain any readable text.");

            const parsed = window.SecurityCheckParser.parseAndFormat(content);
            currentOutput = parsed.output;
            markdownContent.textContent = currentOutput;
            renderPreview(currentOutput);
            emptyOutput.hidden = true;
            generatedOutput.hidden = false;
            setActiveTab("markdown");
            setMessage(processMessage, "", "");
        } catch (error) {
            resetOutput();
            setMessage(processMessage, error && error.message ? error.message : "Unable to parse this report.", "error");
        } finally {
            processing = false;
            updateParseButton();
        }
    }

    async function copyOutput() {
        if (!currentOutput) return;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(currentOutput);
            } else {
                const temporary = document.createElement("textarea");
                temporary.value = currentOutput;
                temporary.setAttribute("readonly", "");
                temporary.className = "copy-fallback";
                document.body.append(temporary);
                temporary.select();
                const copied = document.execCommand("copy");
                temporary.remove();
                if (!copied) throw new Error("Clipboard access is unavailable in this browser.");
            }
            copyBtn.querySelector("span").textContent = "COPIED";
            setMessage(processMessage, "Output copied to clipboard.", "success");
            window.setTimeout(() => {
                if (copyBtn.querySelector("span").textContent === "COPIED") {
                    copyBtn.querySelector("span").textContent = "COPY OUTPUT";
                }
            }, 1800);
        } catch (_) {
            setMessage(processMessage, "Could not copy automatically. Select the Markdown tab and copy the text manually.", "error");
        }
    }

    dropZone.addEventListener("click", event => {
        if (event.target.closest("input")) return;
        fileInput.click();
    });
    dropZone.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInput.click();
        }
    });
    dropZone.addEventListener("dragover", event => {
        event.preventDefault();
        dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", event => {
        if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("dragover");
    });
    dropZone.addEventListener("drop", event => {
        event.preventDefault();
        dropZone.classList.remove("dragover");
        if (event.dataTransfer.files && event.dataTransfer.files.length) {
            handleFile(event.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener("change", () => {
        if (fileInput.files && fileInput.files.length) handleFile(fileInput.files[0]);
        fileInput.value = "";
    });
    parseBtn.addEventListener("click", parseSelectedFile);
    markdownTab.addEventListener("click", () => setActiveTab("markdown"));
    previewTab.addEventListener("click", () => setActiveTab("preview"));
    copyBtn.addEventListener("click", copyOutput);

    resetOutput();
    updateParseButton();
})();
