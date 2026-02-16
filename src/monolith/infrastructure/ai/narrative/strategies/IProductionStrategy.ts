import { NovelChapter } from "../NovelProductionService.js";

export interface IProductionStrategy {
    /**
     * The name of the mode (e.g., "ESSAY", "STRUCTURED").
     */
    readonly mode: string;

    /**
     * Initialize a new chapter with default settings for this mode.
     */
    initializeChapter(
        chapterId: number,
        title: string,
        description: string,
    ): NovelChapter;

    /**
     * Advance the chapter to the next pass.
     * Returns the result of the advancement.
     */
    advancePass(
        chapter: NovelChapter,
        fullPath: string,
        summary: string,
        force: boolean,
        overrideNextPass?: string,
    ): Promise<{ success: boolean; message: string }>;

    /**
     * generate the context string for the AI prompt based on the current state.
     */
    getContext(
        chapter: NovelChapter,
        volumeContext: string,
        history: string,
    ): string;
}
