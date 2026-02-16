import * as fs from "fs/promises";
import * as path from "path";
import { NovelChapter, NovelVolume } from "./NovelProductionService.js";
import { countWords } from "./ProductionUtils.js";

export class NarrativeFileSystem {
    private readonly novelDir = "novel";
    private readonly backupDir = ".vault/backups";
    
    // Cache State
    private structureCache: { volumes: NovelVolume[] } | null = null;
    private isDirty: boolean = true;

    constructor(private rootPath: string) { }

    private get novelPath(): string {
        return path.join(this.rootPath, this.novelDir);
    }

    private get backupPath(): string {
        return path.join(this.rootPath, this.backupDir);
    }

    async initialize(): Promise<void> {
        await fs.mkdir(this.novelPath, { recursive: true });
        await fs.mkdir(this.backupPath, { recursive: true });
    }

    /**
     * Scans the filesystem to reconstruct the Novel Structure
     */
    async loadStructure(forceRefresh: boolean = false): Promise<{ volumes: NovelVolume[] }> {
        if (!forceRefresh && !this.isDirty && this.structureCache) {
            return this.structureCache;
        }

        const volumes: NovelVolume[] = [];

        try {
            await fs.mkdir(this.novelPath, { recursive: true });
            const volDirs = await fs.readdir(this.novelPath, { withFileTypes: true });

            for (const dirent of volDirs) {
                if (!dirent.isDirectory()) continue;

                const volId = this.parseIdFromFolderName(dirent.name);
                if (volId === null) continue;

                const volPath = path.join(this.novelPath, dirent.name);
                const volume: NovelVolume = {
                    id: volId,
                    title: this.parseTitleFromFolderName(dirent.name),
                    status: "DRAFT",
                    mode: "ESSAY",
                    chapters: []
                };

                // Load Volume Metadata
                try {
                    const volMetaPath = path.join(volPath, "volume.json");
                    const volMetaContent = await fs.readFile(volMetaPath, "utf-8");
                    const volMeta = JSON.parse(volMetaContent);
                    Object.assign(volume, volMeta);
                    // Reset chapters to ensure we don't duplicate what's in JSON with what we scan from FS.
                    // The Filesystem is the source of truth for existence.
                    volume.chapters = [];
                } catch (e) {
                    // Ignore missing metadata, rely on folder name
                }

                // Load Chapters
                const chapDirs = await fs.readdir(volPath, { withFileTypes: true });
                for (const chapDirent of chapDirs) {
                    if (!chapDirent.isDirectory()) continue;

                    const chapId = this.parseIdFromFolderName(chapDirent.name);
                    if (chapId === null) continue;



                    const chapPath = path.join(volPath, chapDirent.name);
                    try {
                        const chapMetaPath = path.join(chapPath, "chapter.json");
                        const chapterContent = await fs.readFile(chapMetaPath, "utf-8");
                        const chapter: NovelChapter = JSON.parse(chapterContent);

                        // Enforce ID consistency
                        chapter.id = chapId;

                        // Validated file paths
                        // We strictly set the 'files' array to what actually exists in the folder
                        // relative to the PROJECT ROOT
                        const potentialFiles = ["content.md", "notes.md", "outline.md"];
                        const actualFiles: string[] = [];

                        const projectRelativeChapPath = path.join(this.novelDir, dirent.name, chapDirent.name);

                        for (const f of potentialFiles) {
                            try {
                                await fs.access(path.join(chapPath, f));
                                actualFiles.push(path.join(projectRelativeChapPath, f));
                            } catch { }
                        }

                        // If the chapter.json has other files (like images), and they exist, keep them.
                        // DEBUG: Check files list
                        // console.log(`   Internal files: ${chapter.files?.join(", ")}`);

                        if (chapter.files) {
                            for (const f of chapter.files) {
                                // standardizing on forward slashes for comparison
                                const normalizedF = f.replace(/\\/g, "/");
                                const normalizedActual = actualFiles.map(af => af.replace(/\\/g, "/"));

                                if (normalizedActual.includes(normalizedF)) continue;

                                // check if it exists
                                try {
                                    await fs.access(path.join(this.rootPath, f));
                                    actualFiles.push(f);
                                } catch { }
                            }
                        }

                        chapter.files = actualFiles;

                        // Calculate word count if missing
                        if (chapter.wordCount === undefined) {
                            chapter.wordCount = await this.calculateChapterWordCount(chapter, chapPath);
                        }

                        volume.chapters.push(chapter);
                    } catch (e) {
                        console.warn(`[NarrativeFS] Skipped malformed chapter: ${chapPath}`);
                    }
                }

                volume.chapters.sort((a, b) => a.id - b.id);
                volumes.push(volume);
            }

            volumes.sort((a, b) => a.id - b.id);

        } catch (e) {
            console.error("[NarrativeFS] Error scanning structure:", e);
        }

        this.structureCache = { volumes };
        this.isDirty = false;
        return this.structureCache;
    }

    /**
     * Persists a chapter. Handles folder creation and renaming if title changed.
     */
    async saveChapter(volumeId: number, volumeTitle: string, chapter: NovelChapter): Promise<void> {
        // 1. Find or Create Volume Directory
        let volDirName = await this.findDirectoryById(this.novelPath, volumeId);
        if (!volDirName) {
            volDirName = this.formatFolderName(volumeId, volumeTitle);
            await fs.mkdir(path.join(this.novelPath, volDirName), { recursive: true });
        }

        const volPath = path.join(this.novelPath, volDirName);

        // 2. Find or Create Chapter Directory
        let chapDirName = await this.findDirectoryById(volPath, chapter.id);
        const expectedChapDirName = this.formatFolderName(chapter.id, chapter.title);

        if (chapDirName && chapDirName !== expectedChapDirName) {
            // Rename logic
            const oldPath = path.join(volPath, chapDirName);
            const newPath = path.join(volPath, expectedChapDirName);
            await fs.rename(oldPath, newPath);
            chapDirName = expectedChapDirName;
        } else if (!chapDirName) {
            chapDirName = expectedChapDirName;
            await fs.mkdir(path.join(volPath, chapDirName), { recursive: true });
        }

        const chapPath = path.join(volPath, chapDirName);

        // 3. Update Metrics (Word Count & Timestamp)
        chapter.wordCount = await this.calculateChapterWordCount(chapter, chapPath);
        chapter.lastModified = new Date().toISOString();

        // 4. Save Metadata
        const metaPath = path.join(chapPath, "chapter.json");
        await fs.writeFile(metaPath, JSON.stringify(chapter, null, 2));

        // 5. Update Cache (Write-Through)
        if (this.structureCache) {
            let vol = this.structureCache.volumes.find(v => v.id === volumeId);
            if (!vol) {
                // If volume not in cache but we are saving to it, maybe cache is stale or incomplete.
                // For safety, assume cache is valid and we just add the volume? 
                // Or better, just dirty the cache if volume missing to force reload.
                this.isDirty = true;
            } else {
                const idx = vol.chapters.findIndex(c => c.id === chapter.id);
                if (idx >= 0) {
                    vol.chapters[idx] = chapter;
                } else {
                    vol.chapters.push(chapter);
                    vol.chapters.sort((a, b) => a.id - b.id);
                }
                // Cache remains clean
            }
        }
    }

    /**
     * Writes content to a file, creating a backup first if the file exists.
     */
    async writeContent(filePath: string, content: string): Promise<void> {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.rootPath, filePath);

        // Backup
        try {
            await fs.access(fullPath);
            await this.backupFile(fullPath);
        } catch {
            // File doesn't exist, no backup needed
        }

        // Write
        await fs.writeFile(fullPath, content);
    }

    /**
     * Internal helper to backup a file
     */
    private async backupFile(filePath: string): Promise<void> {
        try {
            await fs.mkdir(this.backupPath, { recursive: true });

            const fileName = path.basename(filePath);
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const backupName = `${timestamp}_${fileName}`;
            const destPath = path.join(this.backupPath, backupName);

            await fs.copyFile(filePath, destPath);
        } catch (e) {
            console.warn(`[NarrativeFS] Backup failed for ${filePath}:`, e);
            // Don't fail the main operation if backup fails
        }
    }

    private async calculateChapterWordCount(chapter: NovelChapter, chapPath: string): Promise<number> {
        let count = 0;
        const contentFiles = ["content.md", "scene.md"]; // Prioritize prose files

        for (const f of contentFiles) {
            try {
                const p = path.join(chapPath, f);
                const content = await fs.readFile(p, "utf-8");
                count += countWords(content);
            } catch { }
        }
        return count;
    }

    async saveVolume(volume: NovelVolume): Promise<void> {
        this.isDirty = true; // Invalidate cache on write

        // Find volume dir
        let volDirName = await this.findDirectoryById(this.novelPath, volume.id);
        if (!volDirName) {
            volDirName = this.formatFolderName(volume.id, volume.title);
            await fs.mkdir(path.join(this.novelPath, volDirName), { recursive: true });
        } else {
            const expected = this.formatFolderName(volume.id, volume.title);
            if (volDirName !== expected) {
                await fs.rename(path.join(this.novelPath, volDirName), path.join(this.novelPath, expected));
                volDirName = expected;
            }
        }

        const volPath = path.join(this.novelPath, volDirName);
        await fs.writeFile(path.join(volPath, "volume.json"), JSON.stringify(volume, null, 2));
    }

    // ─── Public Path Helpers ───

    // ─── Public Path Helpers ───

    public sanitizeTitle(title: string): string {
        return title.replace(/[\/\\:*?"<>|]/g, "").trim().substring(0, 64);
    }

    public async getVolumeDirectory(volumeId: number): Promise<string> {
        let volDirName = await this.findDirectoryById(this.novelPath, volumeId);
        if (!volDirName) {
            // If strictly getting, we might want to return null or throw?
            // For now, let's return the theoretical path, but the caller must handle creation if needed.
            // Actually, let's keep it consistent: returns the full path.
            // If it doesn't exist, we might want to know.
            // But usually this is used to *access* content.
            // If we are *creating* content, we use saveVolume/saveChapter.
            // Let's assume Volume 1 default for robustness if ID 1.
            volDirName = this.formatFolderName(volumeId, "Volume " + volumeId);
        }
        return path.join(this.novelPath, volDirName);
    }

    public async getChapterDirectory(volumeId: number, chapterId: number, chapterTitle?: string): Promise<string> {
        let volDirName = await this.findDirectoryById(this.novelPath, volumeId);
        if (!volDirName) {
            // Fallback for missing volume dir
            volDirName = this.formatFolderName(volumeId || 1, "Volume " + (volumeId || 1));
        }

        const volPath = path.join(this.novelPath, volDirName);

        let chapDirName = await this.findDirectoryById(volPath, chapterId);
        if (!chapDirName) {
            if (chapterTitle) {
                chapDirName = this.formatFolderName(chapterId, chapterTitle);
            } else {
                // If we can't find it and don't know the title, we can't construct the path specific to this FS scheme
                throw new Error(`Chapter ${chapterId} not found and no title provided to construct path.`);
            }
        }

        return path.join(volPath, chapDirName);
    }

    // ─── Private Helpers ───


    private async findDirectoryById(basePath: string, id: number): Promise<string | null> {
        try {
            const dirs = await fs.readdir(basePath, { withFileTypes: true });
            for (const d of dirs) {
                if (!d.isDirectory()) continue;
                if (this.parseIdFromFolderName(d.name) === id) {
                    return d.name;
                }
            }
        } catch {
            return null;
        }
        return null;
    }

    private parseIdFromFolderName(name: string): number | null {
        const match = name.match(/^(\d+)\s*-\s*/);
        return match ? parseInt(match[1], 10) : null;
    }

    private parseTitleFromFolderName(name: string): string {
        const match = name.match(/^(\d+)\s*-\s*(.+)$/);
        return match ? match[2].trim() : name;
    }

    public formatFolderName(id: number, title: string): string {
        const safeTitle = this.sanitizeTitle(title);
        const paddedId = id.toString().padStart(2, '0');
        return `${paddedId} - ${safeTitle}`;
    }
}
