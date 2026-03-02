import { requestUrl } from "obsidian";
import { LinearIssue, LinearProject } from "./types";

const LINEAR_API = "https://api.linear.app/graphql";

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  state { name type color }
  priority
  priorityLabel
  assignee { name email }
  project { name }
  labels { nodes { name color } }
  createdAt
  updatedAt
`;

interface ViewerResponse {
  viewer: { id: string; name: string; email: string };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface LinearConnection<T> {
  nodes: T[];
  pageInfo: PageInfo;
}

interface IssuesResponse {
  issues: LinearConnection<LinearIssue>;
}

interface ProjectsResponse {
  projects: LinearConnection<LinearProject>;
}

export class LinearClient {
  private apiKey: string;
  private static readonly PAGE_SIZE = 200;
  private static readonly MAX_ITEMS = 2000;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async testConnection(): Promise<boolean> {
    try {
      const data = await this.graphql<ViewerResponse>(
        `query { viewer { id name email } }`,
      );
      return !!data.viewer?.id;
    } catch {
      return false;
    }
  }

  async fetchMyIssues(): Promise<LinearIssue[]> {
    const query = `query MyIssues($first: Int!, $after: String) {
      issues(
        filter: {
          assignee: { isMe: { eq: true } }
          state: { type: { nin: ["completed", "cancelled"] } }
        }
        first: $first
        after: $after
        orderBy: updatedAt
      ) {
        nodes { ${ISSUE_FIELDS} }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    return this.paginatedQuery<LinearIssue>(query, "issues");
  }

  async fetchTeamIssues(): Promise<LinearIssue[]> {
    const query = `query TeamIssues($first: Int!, $after: String) {
      issues(
        filter: {
          state: { type: { nin: ["completed", "cancelled"] } }
        }
        first: $first
        after: $after
        orderBy: updatedAt
      ) {
        nodes { ${ISSUE_FIELDS} }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    return this.paginatedQuery<LinearIssue>(query, "issues");
  }

  async fetchProjects(): Promise<LinearProject[]> {
    const query = `query Projects($first: Int!, $after: String) {
      projects(
        filter: {
          state: { type: { in: ["backlog", "planned", "started", "paused"] } }
        }
        first: $first
        after: $after
        orderBy: updatedAt
      ) {
        nodes {
          id
          name
          description
          state
          icon
          color
          progress
          lead { name email }
          startDate
          targetDate
        }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    return this.paginatedQuery<LinearProject>(query, "projects");
  }

  private async paginatedQuery<T, TKey extends string = string>(
    query: string,
    connectionKey: TKey,
  ): Promise<T[]> {
    const allNodes: T[] = [];
    let after: string | null = null;

    while (true) {
      const data: Record<TKey, LinearConnection<T>> = await this.graphql<
        Record<TKey, LinearConnection<T>>
      >(query, {
        first: LinearClient.PAGE_SIZE,
        after,
      });
      const connection: LinearConnection<T> = data[connectionKey];
      allNodes.push(...connection.nodes);

      if (allNodes.length >= LinearClient.MAX_ITEMS) {
        return allNodes.slice(0, LinearClient.MAX_ITEMS);
      }

      if (
        !connection.pageInfo.hasNextPage ||
        connection.pageInfo.endCursor === null
      ) {
        break;
      }

      after = connection.pageInfo.endCursor;
    }

    return allNodes;
  }

  private async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await requestUrl({
      url: LINEAR_API,
      method: "POST",
      headers: {
        Authorization: this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (response.status >= 400) {
      throw new Error(`Linear API error ${response.status}: ${response.text}`);
    }
    return response.json.data as T;
  }
}
