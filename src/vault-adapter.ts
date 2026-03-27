import * as fs from "fs";
import * as path from "path";

export class VaultFile {
	constructor(public path: string) {}
}

export class VaultAdapter {
	private vaultRoot: string;

	constructor(vaultRoot: string) {
		this.vaultRoot = vaultRoot;
	}

	private resolvePath(relativePath: string): string {
		return path.join(this.vaultRoot, relativePath);
	}

	getAbstractFileByPath(relativePath: string): VaultFile | null {
		const abs = this.resolvePath(relativePath);
		if (fs.existsSync(abs)) {
			return new VaultFile(relativePath);
		}
		return null;
	}

	async read(file: VaultFile): Promise<string> {
		const abs = this.resolvePath(file.path);
		return fs.readFileSync(abs, "utf-8");
	}

	async modify(file: VaultFile, content: string): Promise<void> {
		const abs = this.resolvePath(file.path);
		fs.writeFileSync(abs, content, "utf-8");
	}

	async create(relativePath: string, content: string): Promise<void> {
		const abs = this.resolvePath(relativePath);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, content, "utf-8");
	}

	async createFolder(relativePath: string): Promise<void> {
		const abs = this.resolvePath(relativePath);
		fs.mkdirSync(abs, { recursive: true });
	}

	async createBinary(relativePath: string, data: ArrayBuffer): Promise<void> {
		const abs = this.resolvePath(relativePath);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, Buffer.from(data));
	}

	async modifyBinary(file: VaultFile, data: ArrayBuffer): Promise<void> {
		const abs = this.resolvePath(file.path);
		fs.writeFileSync(abs, Buffer.from(data));
	}

	getMarkdownFiles(): VaultFile[] {
		const results: VaultFile[] = [];
		const walk = (dir: string) => {
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					walk(full);
				} else if (entry.isFile() && entry.name.endsWith(".md")) {
					const rel = path.relative(this.vaultRoot, full);
					results.push(new VaultFile(rel));
				}
			}
		};
		walk(this.vaultRoot);
		return results;
	}
}

export function normalizePath(p: string): string {
	// Normalize separators to forward slashes, remove leading/trailing slashes
	return p
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
}
