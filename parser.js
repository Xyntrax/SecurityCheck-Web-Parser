(function () {
    "use strict";

    const WARN = /(?:Warning!|Attention!|Внимание!)/;
    const DOWNLOAD_LABEL = /(?:Download\s+Updates?|Скачать\s+обновления)/i;
    const EOL = /(?:no longer supported|больше не поддерживается)/i;
    const REMOTE = /(?:Remote desktop software!|Remote access program!|Программа для удал[её]нного)/i;
    const SETTING_LABEL = /(User Account Control|The elevation prompt for .+?)/;
    const UAC_LINE = /^(User Account Control|The elevation prompt for .+?)\s*\[color=red\]\[b\](.+?)\[\/b\]/;
    const RECOMMEND = /(?:It is recommended to uninstall|Uninstallation recommended|Рекомендуется удалить|Рекомендуется деинсталляция)/i;

    function stripBB(text) {
        return text
            .replace(/\[i\].*?\[\/i\]/g, "")
            .replace(/\[\/?[^\]]*\]/g, "")
            .replace(/\s+/g, " ")
            .replace(/\^/g, "")
            .replace(/^[ .]+|[ .]+$/g, "");
    }

    function appName(line) {
        const match = line.match(/\s*\[(?:b|color|i|url)[^\]]*\]/);
        return (match ? line.slice(0, match.index) : line).trim();
    }

    function warningSegments(line) {
        const warningPattern = /(?:Warning!|Attention!|Внимание!)/g;
        const marks = Array.from(line.matchAll(warningPattern));
        return marks.map((mark, index) => {
            const start = mark.index + mark[0].length;
            const end = index + 1 < marks.length ? marks[index + 1].index : line.length;
            return { offset: start, text: line.slice(start, end) };
        });
    }

    function parseLines(content) {
        const results = [];
        let windowsVersion = null;

        for (let line of content.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)) {
            line = line.trim();
            if (!line) continue;

            const winMatch = line.match(/^(Windows \d+ \S+ \([\p{L}\p{N}_]+\)) Release: ([\p{L}\p{N}_]+)/u);
            if (winMatch) {
                windowsVersion = `${winMatch[1]} ${winMatch[2]}`;
                continue;
            }

            const uacMatch = line.match(UAC_LINE);
            if (uacMatch) {
                results.push({
                    type: "setting",
                    setting: uacMatch[1].trim(),
                    state: stripBB(uacMatch[2])
                });
                continue;
            }

            if (line.startsWith("[color=red]") && !appName(line)) {
                const text = stripBB(line);
                if (text) {
                    const labelled = text.match(/^(User Account Control|The elevation prompt for .+?)\s+(.+)$/);
                    if (labelled) {
                        results.push({ type: "setting", setting: labelled[1], state: labelled[2] });
                    } else {
                        results.push({ type: "setting", setting: text, state: "" });
                    }
                }
                continue;
            }

            if (line.startsWith("[color=blue]")) {
                const urlMatch = line.match(/\[url=(.*?)\]([^\[]+)\[\/url\]/);
                if (urlMatch && stripBB(line).toLowerCase().includes("update errors")) {
                    results.push({ type: "note", subject: urlMatch[2].trim(), url: urlMatch[1] });
                } else {
                    const hint = stripBB(line);
                    if (hint && results.length) {
                        const previous = results[results.length - 1].hint;
                        results[results.length - 1].hint = previous ? `${previous}; ${hint}` : hint;
                    }
                }
                continue;
            }

            const hasWarning = WARN.test(line);
            if (!hasWarning && !RECOMMEND.test(line)) continue;

            let app = appName(line);
            if (!app) continue;

            if (!hasWarning) {
                const reason = stripBB(line.slice(app.length));
                if (reason) results.push({ type: "unwanted", app, reason });
                continue;
            }

            if (app === "Extended support has ended" && windowsVersion) {
                app = `${windowsVersion} - Extended support has ended`;
            }

            let handled = false;
            const segments = warningSegments(line);
            let eolAt = null;
            for (const segment of segments) {
                const match = segment.text.match(EOL);
                if (match) {
                    eolAt = segment.offset + match.index;
                    break;
                }
            }

            if (eolAt === null) {
                const downloadPattern = new RegExp(`\\[url=(.*?)\\]\\s*${DOWNLOAD_LABEL.source}\\s*\\[\\/url\\]`, "gi");
                for (const match of line.matchAll(downloadPattern)) {
                    results.push({ type: "update", app, url: match[1] });
                    handled = true;
                }
            } else {
                const urlMatch = line.slice(eolAt).match(/\[url=(.*?)\]/);
                results.push({ type: "eol", app, url: urlMatch ? urlMatch[1] : null });
                handled = true;
            }

            if (REMOTE.test(line)) {
                results.push({ type: "remote_desktop", app });
                handled = true;
            }

            for (const segment of segments) {
                const reason = stripBB(segment.text);
                if (!reason) continue;
                if (DOWNLOAD_LABEL.test(reason)) continue;
                if (EOL.test(reason) || REMOTE.test(reason)) continue;
                results.push({ type: "unwanted", app, reason });
                handled = true;
            }

            if (!handled) results.push({ type: "unwanted", app, reason: "" });
        }

        return results;
    }

    const SECTIONS = [
        { types: ["update"], heading: "Please update the following software:" },
        { types: ["unwanted", "eol"], heading: "Please remove the following potentially unwanted programs (PUP):" },
        { types: ["remote_desktop"], heading: "Please let me know whether you recognize this remote desktop software (if not, uninstall it):" },
        { types: ["setting"], heading: "Please check the following Windows settings:" }
    ];

    function hintSuffix(result) {
        return result.hint ? ` (${result.hint})` : "";
    }

    function formatEntry(result) {
        if (result.type === "update") {
            return `**${result.app}** | [New update available, download here](${result.url})`;
        }
        if (result.type === "eol") {
            let reason = "No longer supported - please uninstall it";
            if (result.url) reason += ` and [replace it here](${result.url})`;
            return `**${result.app}** - ${reason}`;
        }
        if (result.type === "setting") {
            const state = result.state ? ` - ${result.state}` : "";
            return `**${result.setting}**${state}`;
        }
        const reason = result.reason || "";
        return reason ? `**${result.app}** - ${reason}` : `**${result.app}**`;
    }

    function formatReddit(results) {
        const lines = [];
        for (const sectionDefinition of SECTIONS) {
            const section = results.filter(result => sectionDefinition.types.includes(result.type));
            if (!section.length) continue;
            lines.push(`**${sectionDefinition.heading}**`);
            for (const result of section) {
                lines.push(`* ${formatEntry(result)}${hintSuffix(result)}`);
            }
            lines.push("");
        }

        for (const result of results) {
            if (result.type === "note") {
                lines.push(`*Note: If ${result.subject} update errors occur, [reinstall here](${result.url})*`);
            }
        }
        return lines;
    }

    window.SecurityCheckParser = {
        parseLines,
        formatReddit,
        parseAndFormat(content) {
            const results = parseLines(content);
            const lines = formatReddit(results);
            return {
                results,
                lines,
                output: lines.length ? lines.join("\n") : "No items found."
            };
        }
    };
})();
