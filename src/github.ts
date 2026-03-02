import { requestUrl } from "obsidian";
import { GitHubPR } from "./types";

const GITHUB_API = "https://api.github.com";

interface GitHubUserResponse {
  login: string;
  id: number;
  name: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  archived: boolean;
  fork: boolean;
  html_url: string;
}

interface GitHubPRResponse {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  user: { login: string } | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
  labels: { name: string }[];
  requested_reviewers: { login: string }[];
}

export class GitHubClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.get<GitHubUserResponse>("/user");
      return true;
    } catch {
      return false;
    }
  }

  async fetchOrgRepos(org: string): Promise<GitHubRepo[]> {
    const all = await this.getAllPages<GitHubRepo>(
      `/orgs/${org}/repos?per_page=100`,
    );
    return all.filter((r) => !r.archived && !r.fork);
  }

  async fetchPullRequests(owner: string, repo: string): Promise<GitHubPR[]> {
    const raw = await this.getAllPages<GitHubPRResponse>(
      `/repos/${owner}/${repo}/pulls?state=all&per_page=100`,
    );
    return raw.map((pr) => this.mapPR(pr, repo));
  }

  extractLinearIssueIds(title: string, body: string | null): string[] {
    const combined = `${title} ${body ?? ""}`;
    const matches = combined.match(/\b[A-Z]+-\d+\b/g);
    return matches ? [...new Set(matches)] : [];
  }

  private mapPR(raw: GitHubPRResponse, repo: string): GitHubPR {
    return {
      id: raw.id,
      number: raw.number,
      title: raw.title,
      body: raw.body,
      state: raw.merged_at ? "merged" : (raw.state as "open" | "closed"),
      author: raw.user?.login ?? "unknown",
      repo,
      headBranch: raw.head.ref,
      baseBranch: raw.base.ref,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      mergedAt: raw.merged_at,
      labels: raw.labels.map((l) => l.name),
      reviewers: raw.requested_reviewers.map((r) => r.login),
      url: raw.html_url,
    };
  }

  private async get<T>(path: string): Promise<T> {
    const { json } = await this.request(path);
    return json as T;
  }

  private async getAllPages<T>(path: string): Promise<T[]> {
    const all: T[] = [];
    let url: string | null = path;
    while (url) {
      const result = await this.request(url);
      const items = result.json as T[];
      all.push(...items);
      url = result.nextUrl;
    }
    return all;
  }

  private async request(
    path: string,
  ): Promise<{ json: unknown; nextUrl: string | null }> {
    const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
    const response = await requestUrl({
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (response.status >= 400) {
      throw new Error(`GitHub API error ${response.status}: ${response.text}`);
    }
    const linkHeader =
      response.headers["link"] ?? response.headers["Link"] ?? "";
    return {
      json: response.json,
      nextUrl: this.parseNextLink(linkHeader),
    };
  }

  private parseNextLink(linkHeader: string): string | null {
    if (!linkHeader) return null;
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match ? match[1] : null;
  }
}
