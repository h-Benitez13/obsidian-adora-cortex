import { requestUrl } from "obsidian";
import {
  HubSpotCompany,
  HubSpotContact,
  HubSpotDeal,
  HubSpotMeeting,
  HubSpotTicket,
} from "./types";

const HUBSPOT_API = "https://api.hubapi.com";
const PAGE_SIZE = 100;

interface HubSpotObjectResponse {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  properties?: Record<string, string | null | undefined>;
  associations?: Record<string, { results?: { id: string }[] }>;
}

interface HubSpotListResponse {
  results: HubSpotObjectResponse[];
  paging?: {
    next?: {
      after?: string;
    };
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HubSpotClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.fetchPage("/crm/v3/objects/contacts", {
        limit: "1",
        properties: "email",
      });
      return true;
    } catch {
      return false;
    }
  }

  async fetchContacts(): Promise<HubSpotContact[]> {
    const records = await this.fetchAll("/crm/v3/objects/contacts", {
      properties:
        "firstname,lastname,email,phone,company,jobtitle,lifecyclestage,hs_lead_status,lastmodifieddate",
      associations: "companies",
      archived: "false",
    });

    return records.map((record) => {
      const first = this.prop(record, "firstname");
      const last = this.prop(record, "lastname");
      return {
        id: record.id,
        firstName: first,
        lastName: last,
        fullName: [first, last].filter(Boolean).join(" ").trim() || null,
        email: this.prop(record, "email"),
        phone: this.prop(record, "phone"),
        company: this.prop(record, "company"),
        jobTitle: this.prop(record, "jobtitle"),
        lifecycleStage: this.prop(record, "lifecyclestage"),
        leadStatus: this.prop(record, "hs_lead_status"),
        associatedCompanyIds: this.associationIds(record, "companies"),
        createdAt: record.createdAt ?? null,
        updatedAt: this.prop(record, "lastmodifieddate") ?? record.updatedAt ?? null,
      };
    });
  }

  async fetchCompanies(): Promise<HubSpotCompany[]> {
    const records = await this.fetchAll("/crm/v3/objects/companies", {
      properties:
        "name,domain,industry,numberofemployees,annualrevenue,lifecyclestage,hs_lead_status",
      archived: "false",
    });

    return records.map((record) => ({
      id: record.id,
      name: this.prop(record, "name") ?? `Company ${record.id}`,
      domain: this.prop(record, "domain"),
      industry: this.prop(record, "industry"),
      numberOfEmployees: this.prop(record, "numberofemployees"),
      annualRevenue: this.prop(record, "annualrevenue"),
      lifecycleStage: this.prop(record, "lifecyclestage"),
      leadStatus: this.prop(record, "hs_lead_status"),
      createdAt: record.createdAt ?? null,
      updatedAt: record.updatedAt ?? null,
    }));
  }

  async fetchDeals(): Promise<HubSpotDeal[]> {
    const records = await this.fetchAll("/crm/v3/objects/deals", {
      properties:
        "dealname,dealstage,amount,closedate,pipeline,hubspot_owner_id,hs_lastmodifieddate",
      associations: "companies,contacts",
      archived: "false",
    });

    return records.map((record) => ({
      id: record.id,
      name: this.prop(record, "dealname") ?? `Deal ${record.id}`,
      stage: this.prop(record, "dealstage"),
      amount: this.prop(record, "amount"),
      closeDate: this.prop(record, "closedate"),
      pipeline: this.prop(record, "pipeline"),
      ownerId: this.prop(record, "hubspot_owner_id"),
      associatedCompanyIds: this.associationIds(record, "companies"),
      associatedContactIds: this.associationIds(record, "contacts"),
      createdAt: record.createdAt ?? null,
      updatedAt: this.prop(record, "hs_lastmodifieddate") ?? record.updatedAt ?? null,
    }));
  }

  async fetchMeetings(): Promise<HubSpotMeeting[]> {
    const records = await this.fetchAll("/crm/v3/objects/meetings", {
      properties:
        "hs_meeting_title,hs_timestamp,hs_meeting_start_time,hs_meeting_end_time,hs_meeting_body,hs_meeting_outcome",
      associations: "contacts,companies,deals",
      archived: "false",
    });

    return records.map((record) => ({
      id: record.id,
      title: this.prop(record, "hs_meeting_title") ?? `HubSpot Meeting ${record.id}`,
      startTime:
        this.prop(record, "hs_meeting_start_time") ?? this.prop(record, "hs_timestamp"),
      endTime: this.prop(record, "hs_meeting_end_time"),
      body: this.prop(record, "hs_meeting_body"),
      outcome: this.prop(record, "hs_meeting_outcome"),
      associatedContactIds: this.associationIds(record, "contacts"),
      associatedCompanyIds: this.associationIds(record, "companies"),
      associatedDealIds: this.associationIds(record, "deals"),
      createdAt: record.createdAt ?? null,
      updatedAt: record.updatedAt ?? null,
    }));
  }

  async fetchTickets(): Promise<HubSpotTicket[]> {
    const records = await this.fetchAll("/crm/v3/objects/tickets", {
      properties:
        "subject,content,hs_ticket_priority,hs_pipeline_stage,createdate,hs_lastmodifieddate",
      associations: "contacts,companies,deals",
      archived: "false",
    });

    return records.map((record) => ({
      id: record.id,
      subject: this.prop(record, "subject") ?? `Ticket ${record.id}`,
      content: this.prop(record, "content"),
      priority: this.prop(record, "hs_ticket_priority"),
      pipelineStage: this.prop(record, "hs_pipeline_stage"),
      associatedContactIds: this.associationIds(record, "contacts"),
      associatedCompanyIds: this.associationIds(record, "companies"),
      associatedDealIds: this.associationIds(record, "deals"),
      createdAt: this.prop(record, "createdate") ?? record.createdAt ?? null,
      updatedAt: this.prop(record, "hs_lastmodifieddate") ?? record.updatedAt ?? null,
    }));
  }

  private async fetchAll(
    endpoint: string,
    queryParams: Record<string, string>,
  ): Promise<HubSpotObjectResponse[]> {
    const all: HubSpotObjectResponse[] = [];
    let after: string | null = null;

    while (true) {
      const page = await this.fetchPage(endpoint, {
        ...queryParams,
        limit: String(PAGE_SIZE),
        ...(after ? { after } : {}),
      });
      all.push(...page.results);

      after = page.paging?.next?.after ?? null;
      if (!after) break;
      await sleep(250);
    }

    return all;
  }

  private async fetchPage(
    endpoint: string,
    queryParams: Record<string, string>,
  ): Promise<HubSpotListResponse> {
    const url = new URL(`${HUBSPOT_API}${endpoint}`);
    for (const [key, value] of Object.entries(queryParams)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    const response = await requestUrl({
      url: url.toString(),
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status >= 400) {
      throw new Error(`HubSpot API error ${response.status}: ${response.text}`);
    }

    return response.json as HubSpotListResponse;
  }

  private prop(
    record: HubSpotObjectResponse,
    key: string,
  ): string | null {
    const value = record.properties?.[key];
    return typeof value === "string" && value.trim().length > 0 ? value : null;
  }

  private associationIds(
    record: HubSpotObjectResponse,
    associationKey: string,
  ): string[] {
    const entries = record.associations?.[associationKey]?.results ?? [];
    return entries
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }
}
