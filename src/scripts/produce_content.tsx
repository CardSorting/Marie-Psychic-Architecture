#!/usr/bin/env node
import { ContentDirector } from "../monolith/infrastructure/ai/narrative/ContentDirector.js";
import SelectInput from "ink-select-input";
import React from "react";
import { render, Box, Text } from "ink";

const ContentSelector = ({ onSelect }: { onSelect: (item: any) => void }) => {
    const items = [
        { label: "Novel (Structured)", value: "NOVEL" },
        { label: "Short Story", value: "SHORT_STORY" },
        { label: "Article / Journalism", value: "ARTICLE" },
        { label: "Op-Ed / Essay", value: "OP_ED" },
        { label: "LinkedIn (Influencer)", value: "LINKEDIN" }
    ];

    return React.createElement(Box, { flexDirection: "column" },
        React.createElement(Text, { color: "green" }, "Select Content Type:"),
        React.createElement(SelectInput, { items: items, onSelect: onSelect })
    );
};

async function main() {
    const workingDir = process.cwd();

    // For non-interactive (CLI args) support:
    let mode = process.argv[2];

    if (!mode) {
        // Interactive Selection (Promise wrapper for Ink)
        mode = await new Promise<string>((resolve) => {
            const { unmount } = render(
                React.createElement(ContentSelector, {
                    onSelect: (item) => {
                        unmount();
                        resolve(item.value);
                    }
                })
            );
        });
    }

    const director = new ContentDirector(workingDir);
    await director.run(mode as any);
}

main().catch(err => {
    console.error("🛑 Content Director Failed:", err);
    process.exit(1);
});
