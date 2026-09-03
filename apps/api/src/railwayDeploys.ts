import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const RAILWAY_GQL = "https://backboard.railway.com/graphql/v2";

/** Known Bored project — used when RAILWAY_PROJECT_ID is unset (local / pre-link). */
export const BORED_RAILWAY_PROJECT_ID =
  "cbc42430-a3ed-45fd-a203-287161027e0a";

const SERVICE_ORDER = [
  "api",
  "web",
  "ingest-phase1",
  "ingest-movies",
  "ingest-daily",
  "ingest",
  "Postgres",
];

type RailwayMeta = {
  reason?: string;
  buildOnly?: boolean;
  commitHash?: string;
  commitMessage?: string;
  branch?: string;
  repo?: string;
  image?: string;
  duration?: number;
};

export type RailwayServiceDeploy = {
  serviceId: string;
  serviceName: string;
  cronSchedule: string | null;
  nextCronRunAt: string | null;
  latest: {
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    staticUrl: string | null;
    reason: string | null;
    buildOnly: boolean | null;
    commitHash: string | null;
    commitMessage: string | null;
    branch: string | null;
    repo: string | null;
  } | null;
  dashboardUrl: string;
};

export type RailwayRecentDeploy = {
  id: string;
  serviceId: string;
  serviceName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  reason: string | null;
  buildOnly: boolean | null;
  dashboardUrl: string;
};

export type RailwayDeploysPayload = {
  configured: boolean;
  error?: string;
  projectId: string | null;
  projectName: string | null;
  environmentId: string | null;
  environmentName: string | null;
  dashboardUrl: string | null;
  services: RailwayServiceDeploy[];
  recent: RailwayRecentDeploy[];
};

type RailwayAuth =
  | { kind: "bearer"; token: string }
  | { kind: "project"; token: string };

function railwayAuth(): RailwayAuth | null {
  const projectTok =
    process.env.RAILWAY_PROJECT_TOKEN?.trim() || null;
  if (projectTok) return { kind: "project", token: projectTok };

  const bearer =
    process.env.RAILWAY_API_TOKEN?.trim() ||
    process.env.RAILWAY_TOKEN?.trim() ||
    null;
  if (bearer) return { kind: "bearer", token: bearer };

  if (process.env.NODE_ENV === "production") return null;
  // Local DX: reuse `railway login` account token.
  try {
    const raw = readFileSync(join(homedir(), ".railway/config.json"), "utf8");
    const cfg = JSON.parse(raw) as { user?: { token?: string } };
    const t = cfg.user?.token?.trim();
    return t ? { kind: "bearer", token: t } : null;
  } catch {
    return null;
  }
}

function projectId(): string {
  return (
    process.env.RAILWAY_PROJECT_ID?.trim() || BORED_RAILWAY_PROJECT_ID
  );
}

function dashboardProjectUrl(pid: string, envId?: string | null): string {
  const base = `https://railway.com/project/${pid}`;
  return envId ? `${base}?environmentId=${envId}` : base;
}

function dashboardServiceUrl(
  pid: string,
  serviceId: string,
  envId?: string | null,
  deploymentId?: string | null,
): string {
  const params = new URLSearchParams();
  if (envId) params.set("environmentId", envId);
  if (deploymentId) params.set("id", deploymentId);
  const q = params.toString();
  return `https://railway.com/project/${pid}/service/${serviceId}${q ? `?${q}` : ""}`;
}

async function railwayGql<T>(
  auth: RailwayAuth,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "bored-admin/1.0",
  };
  if (auth.kind === "project") {
    headers["Project-Access-Token"] = auth.token;
  } else {
    headers.Authorization = `Bearer ${auth.token}`;
  }
  const res = await fetch(RAILWAY_GQL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Railway API HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  if (!body.data) throw new Error("Railway API returned no data");
  return body.data;
}

function sortServices(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ia = SERVICE_ORDER.indexOf(a);
    const ib = SERVICE_ORDER.indexOf(b);
    const sa = ia === -1 ? 999 : ia;
    const sb = ib === -1 ? 999 : ib;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });
}

function pickMeta(meta: unknown): RailwayMeta {
  if (!meta || typeof meta !== "object") return {};
  return meta as RailwayMeta;
}

export async function fetchRailwayDeploys(): Promise<RailwayDeploysPayload> {
  const auth = railwayAuth();
  const pid = projectId();

  if (!auth) {
    return {
      configured: false,
      error:
        "RAILWAY_PROJECT_TOKEN (or RAILWAY_API_TOKEN) is not set. Create a project token in Railway project settings and set it on the api service (local: railway login is enough).",
      projectId: pid,
      projectName: null,
      environmentId: null,
      environmentName: null,
      dashboardUrl: dashboardProjectUrl(pid),
      services: [],
      recent: [],
    };
  }

  const preferredEnv =
    process.env.RAILWAY_ENVIRONMENT_ID?.trim() ||
    process.env.RAILWAY_ENVIRONMENT?.trim() ||
    null;

  type ProjectData = {
    project: {
      id: string;
      name: string;
      environments: {
        edges: Array<{ node: { id: string; name: string } }>;
      };
      services: {
        edges: Array<{
          node: {
            id: string;
            name: string;
            serviceInstances: {
              edges: Array<{
                node: {
                  environmentId: string;
                  cronSchedule: string | null;
                  nextCronRunAt: string | null;
                  latestDeployment: {
                    id: string;
                    status: string;
                    createdAt: string;
                    updatedAt: string;
                    staticUrl: string | null;
                    meta: unknown;
                  } | null;
                };
              }>;
            };
          };
        }>;
      };
    };
  };

  const data = await railwayGql<ProjectData>(
    auth,
    `query($id: String!) {
      project(id: $id) {
        id
        name
        environments {
          edges { node { id name } }
        }
        services {
          edges {
            node {
              id
              name
              serviceInstances {
                edges {
                  node {
                    environmentId
                    cronSchedule
                    nextCronRunAt
                    latestDeployment {
                      id
                      status
                      createdAt
                      updatedAt
                      staticUrl
                      meta
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { id: pid },
  );

  const envs = data.project.environments.edges.map((e) => e.node);
  const env =
    envs.find((e) => e.id === preferredEnv || e.name === preferredEnv) ??
    envs.find((e) => e.name === "production") ??
    envs[0] ??
    null;
  const envId = env?.id ?? null;

  const nameById = new Map<string, string>();
  const servicesRaw = data.project.services.edges.map((e) => e.node);
  for (const s of servicesRaw) nameById.set(s.id, s.name);

  const orderedNames = sortServices(servicesRaw.map((s) => s.name));
  const byName = new Map(servicesRaw.map((s) => [s.name, s]));

  const services: RailwayServiceDeploy[] = [];
  for (const name of orderedNames) {
    const s = byName.get(name)!;
    const inst =
      s.serviceInstances.edges.find((e) => e.node.environmentId === envId)
        ?.node ?? s.serviceInstances.edges[0]?.node;
    const dep = inst?.latestDeployment ?? null;
    const meta = pickMeta(dep?.meta);
    services.push({
      serviceId: s.id,
      serviceName: s.name,
      cronSchedule: inst?.cronSchedule ?? null,
      nextCronRunAt: inst?.nextCronRunAt ?? null,
      latest: dep
        ? {
            id: dep.id,
            status: dep.status,
            createdAt: dep.createdAt,
            updatedAt: dep.updatedAt,
            staticUrl: dep.staticUrl,
            reason: meta.reason ?? null,
            buildOnly: meta.buildOnly ?? null,
            commitHash: meta.commitHash ?? null,
            commitMessage: meta.commitMessage ?? null,
            branch: meta.branch ?? null,
            repo: meta.repo ?? null,
          }
        : null,
      dashboardUrl: dashboardServiceUrl(pid, s.id, envId, dep?.id),
    });
  }

  type DeploymentsData = {
    deployments: {
      edges: Array<{
        node: {
          id: string;
          status: string;
          createdAt: string;
          updatedAt: string;
          serviceId: string;
          meta: unknown;
        };
      }>;
    };
  };

  const recentInput: Record<string, string> = { projectId: pid };
  if (envId) recentInput.environmentId = envId;

  const recentData = await railwayGql<DeploymentsData>(
    auth,
    `query($input: DeploymentListInput!) {
      deployments(first: 25, input: $input) {
        edges {
          node {
            id
            status
            createdAt
            updatedAt
            serviceId
            meta
          }
        }
      }
    }`,
    { input: recentInput },
  );

  const recent: RailwayRecentDeploy[] = recentData.deployments.edges.map(
    (e) => {
      const n = e.node;
      const meta = pickMeta(n.meta);
      return {
        id: n.id,
        serviceId: n.serviceId,
        serviceName: nameById.get(n.serviceId) ?? n.serviceId.slice(0, 8),
        status: n.status,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        reason: meta.reason ?? null,
        buildOnly: meta.buildOnly ?? null,
        dashboardUrl: dashboardServiceUrl(pid, n.serviceId, envId, n.id),
      };
    },
  );

  return {
    configured: true,
    projectId: data.project.id,
    projectName: data.project.name,
    environmentId: envId,
    environmentName: env?.name ?? null,
    dashboardUrl: dashboardProjectUrl(data.project.id, envId),
    services,
    recent,
  };
}
