import * as fs from "fs/promises";
import * as path from "path";
import { FileSystemPort } from "../infrastructure/ai/core/FileSystemPort.js";

/**
 * CliFileSystemPort - Implementation of FileSystemPort for the CLI environment.
 * Uses standard Node.js fs/promises for file operations.
 */
export class CliFileSystemPort implements FileSystemPort {
  public readonly type = "cli";
  private backups = new Map<string, string>();

  constructor(private workingDir: string) {}

  private resolve(filePath: string): string {
    return path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.workingDir, filePath);
  }

  async readFile(filePath: string, _signal?: AbortSignal): Promise<string> {
    try {
      return await fs.readFile(this.resolve(filePath), "utf-8");
    } catch (error: any) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  async writeFile(
    filePath: string,
    content: string,
    _signal?: AbortSignal,
  ): Promise<void> {
    const fullPath = this.resolve(filePath);
    let lastError: any;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
        return; // Success
      } catch (error: any) {
        lastError = error;
        // Retry on busy or locked files (common on macOS/Windows)
        if (["EBUSY", "EPERM", "ENOLCK"].includes(error.code) && attempt < 3) {
          await new Promise(r => setTimeout(r, 100 * attempt));
          continue;
        }
        throw new Error(`Failed to write file ${filePath}: ${error.message}`);
      }
    }
    throw lastError;
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.rm(this.resolve(filePath), { force: true });
    } catch (error: any) {
      throw new Error(`Failed to delete file ${filePath}: ${error.message}`);
    }
  }

  async backupFile(filePath: string): Promise<void> {
    try {
      const content = await this.readFile(filePath);
      this.backups.set(filePath, content);
    } catch {
      // If file doesn't exist, we'll store null/empty to represent "delete on rollback"
      this.backups.set(filePath, "__NON_EXISTENT__");
    }
  }

  async restoreFile(filePath: string): Promise<void> {
    const content = this.backups.get(filePath);
    if (content === undefined) return;

    if (content === "__NON_EXISTENT__") {
      try {
        await this.deleteFile(filePath);
      } catch {
        // Ignore errors during restore-delete
      }
    } else {
      await this.writeFile(filePath, content);
    }
    this.backups.delete(filePath);
  }

  async rollbackAll(): Promise<void> {
    const paths = Array.from(this.backups.keys());
    for (const p of paths) {
      await this.restoreFile(p);
    }
    this.backups.clear();
  }

  clearBackups(): void {
    this.backups.clear();
  }
}
