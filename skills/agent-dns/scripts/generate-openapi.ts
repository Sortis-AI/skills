import { writeFileSync } from "node:fs";
import { join } from "node:path";

const problemDetail = {
  type: "object",
  properties: {
    type: { type: "string" },
    title: { type: "string" },
    status: { type: "integer" },
    detail: { type: "string" },
  },
  required: ["type", "title", "status", "detail"],
};

const spec = {
  openapi: "3.1.0",
  info: {
    title: "agent-dns",
    version: "0.1.0",
    description:
      "MPP-enabled agent-first DNS management and domain registration API",
  },
  servers: [{ url: "http://localhost:3000" }],
  components: {
    schemas: {
      ProblemDetail: problemDetail,
      Zone: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          nameServers: { type: "array", items: { type: "string" } },
          recordCount: { type: "integer" },
          status: { type: "string" },
          extensions: { type: "object" },
        },
        required: ["id", "name", "nameServers"],
      },
      RecordType: {
        type: "string",
        enum: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "SOA", "PTR"],
      },
      DnsRecord: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { $ref: "#/components/schemas/RecordType" },
          ttl: { type: "integer" },
          values: { type: "array", items: { type: "string" } },
          data: { type: "object" },
          extensions: { type: "object" },
        },
        required: ["name", "type", "ttl", "values"],
      },
      DomainAvailability: {
        type: "object",
        properties: {
          domain: { type: "string" },
          available: { type: "boolean" },
          premium: { type: "boolean" },
          price: {
            type: "object",
            properties: {
              amount: { type: "number" },
              currency: { type: "string" },
            },
            required: ["amount", "currency"],
          },
        },
        required: ["domain", "available", "premium"],
      },
      TldPricing: {
        type: "object",
        properties: {
          tld: { type: "string" },
          registration: {
            type: "object",
            properties: {
              amount: { type: "number" },
              currency: { type: "string" },
            },
            required: ["amount", "currency"],
          },
          renewal: {
            type: "object",
            properties: {
              amount: { type: "number" },
              currency: { type: "string" },
            },
            required: ["amount", "currency"],
          },
          transfer: {
            type: "object",
            properties: {
              amount: { type: "number" },
              currency: { type: "string" },
            },
            required: ["amount", "currency"],
          },
        },
        required: ["tld", "registration", "renewal", "transfer"],
      },
      OperationStatus: {
        type: "string",
        enum: ["PENDING", "IN_PROGRESS", "SUCCEEDED", "FAILED"],
      },
      DomainOperation: {
        type: "object",
        properties: {
          operationId: { type: "string" },
          domain: { type: "string" },
          type: { type: "string", enum: ["REGISTER", "TRANSFER", "RENEW"] },
          status: { $ref: "#/components/schemas/OperationStatus" },
          submittedAt: { type: "string", format: "date-time" },
          message: { type: "string" },
        },
        required: ["operationId", "domain", "type", "status", "submittedAt"],
      },
    },
    responses: {
      PaymentRequired: {
        description: "Payment required — include an MPP payment header",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ProblemDetail" },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ProblemDetail" },
          },
        },
      },
      BadRequest: {
        description: "Invalid request body or parameters",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ProblemDetail" },
          },
        },
      },
      InternalError: {
        description: "Internal server error",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ProblemDetail" },
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        operationId: "getHealth",
        summary: "Health check",
        tags: ["System"],
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    timestamp: { type: "string", format: "date-time" },
                    version: { type: "string" },
                  },
                  required: ["status", "timestamp", "version"],
                },
              },
            },
          },
        },
      },
    },
    "/pricing": {
      get: {
        operationId: "getPricing",
        summary: "Get pricing structure",
        tags: ["System"],
        responses: {
          "200": {
            description: "Pricing information",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    currency: { type: "string" },
                    paymentProtocol: { type: "string" },
                    paymentMethods: {
                      type: "array",
                      items: { type: "string" },
                    },
                    operations: { type: "object" },
                    free: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/capabilities": {
      get: {
        operationId: "getCapabilities",
        summary: "Get provider capabilities",
        tags: ["System"],
        responses: {
          "200": {
            description: "Provider capabilities",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    providers: {
                      type: "object",
                      properties: {
                        dns: { type: "array", items: { type: "string" } },
                        registrar: { type: "array", items: { type: "string" } },
                      },
                      required: ["dns", "registrar"],
                    },
                    capabilities: {
                      nullable: true,
                      type: "object",
                    },
                  },
                  required: ["providers", "capabilities"],
                },
              },
            },
          },
        },
      },
    },
    "/SKILL.md": {
      get: {
        operationId: "getSkillMd",
        summary: "Agent skill descriptor",
        description: "Returns the SKILL.md file describing this agent's capabilities for agent discovery.",
        tags: ["System"],
        responses: {
          "200": {
            description: "SKILL.md contents",
            content: {
              "text/markdown": {
                schema: { type: "string" },
              },
            },
          },
          "404": {
            description: "SKILL.md not found",
          },
        },
      },
    },
    "/openapi.json": {
      get: {
        operationId: "getOpenApiSpec",
        summary: "OpenAPI specification",
        description: "Returns this OpenAPI 3.1 specification.",
        tags: ["System"],
        responses: {
          "200": {
            description: "OpenAPI spec",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
          "404": {
            description: "Spec not generated yet",
          },
        },
      },
    },
    "/zones": {
      get: {
        operationId: "listZones",
        summary: "List DNS zones",
        tags: ["DNS Zones"],
        responses: {
          "200": {
            description: "List of zones",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    zones: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Zone" },
                    },
                  },
                  required: ["zones"],
                },
              },
            },
          },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      post: {
        operationId: "createZone",
        summary: "Create a DNS zone",
        tags: ["DNS Zones"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  visibility: { type: "string", enum: ["public", "private"] },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Zone created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Zone" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/zones/{zoneId}": {
      get: {
        operationId: "getZone",
        summary: "Get a DNS zone",
        tags: ["DNS Zones"],
        parameters: [
          {
            name: "zoneId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Zone details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Zone" },
              },
            },
          },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      delete: {
        operationId: "deleteZone",
        summary: "Delete a DNS zone",
        tags: ["DNS Zones"],
        parameters: [
          {
            name: "zoneId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Zone deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", enum: [true] } },
                  required: ["success"],
                },
              },
            },
          },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/zones/{zoneId}/records": {
      get: {
        operationId: "listRecords",
        summary: "List DNS records in a zone",
        tags: ["DNS Records"],
        parameters: [
          {
            name: "zoneId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "type",
            in: "query",
            required: false,
            schema: { $ref: "#/components/schemas/RecordType" },
          },
          {
            name: "name",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "List of records",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    records: {
                      type: "array",
                      items: { $ref: "#/components/schemas/DnsRecord" },
                    },
                  },
                  required: ["records"],
                },
              },
            },
          },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/zones/{zoneId}/records/{name}/{type}": {
      get: {
        operationId: "getRecord",
        summary: "Get a DNS RRset",
        tags: ["DNS Records"],
        parameters: [
          {
            name: "zoneId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "name",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "type",
            in: "path",
            required: true,
            schema: { $ref: "#/components/schemas/RecordType" },
          },
        ],
        responses: {
          "200": {
            description: "DNS record",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DnsRecord" },
              },
            },
          },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      put: {
        operationId: "upsertRecord",
        summary: "Upsert a DNS RRset",
        tags: ["DNS Records"],
        parameters: [
          {
            name: "zoneId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "name",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "type",
            in: "path",
            required: true,
            schema: { $ref: "#/components/schemas/RecordType" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ttl: { type: "integer" },
                  values: { type: "array", items: { type: "string" } },
                  data: { type: "object" },
                  extensions: { type: "object" },
                },
                required: ["ttl", "values"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Record upserted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DnsRecord" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      delete: {
        operationId: "deleteRecord",
        summary: "Delete a DNS RRset",
        tags: ["DNS Records"],
        parameters: [
          {
            name: "zoneId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "name",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "type",
            in: "path",
            required: true,
            schema: { $ref: "#/components/schemas/RecordType" },
          },
        ],
        responses: {
          "200": {
            description: "Record deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", enum: [true] } },
                  required: ["success"],
                },
              },
            },
          },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/zones/{zoneId}/records/batch": {
      put: {
        operationId: "batchUpsertRecords",
        summary: "Batch upsert DNS records",
        tags: ["DNS Records"],
        parameters: [
          {
            name: "zoneId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  records: {
                    type: "array",
                    items: { $ref: "#/components/schemas/DnsRecord" },
                  },
                },
                required: ["records"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Records upserted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    records: {
                      type: "array",
                      items: { $ref: "#/components/schemas/DnsRecord" },
                    },
                  },
                  required: ["records"],
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/domains/check/{domain}": {
      get: {
        operationId: "checkDomainAvailability",
        summary: "Check domain availability",
        tags: ["Domains"],
        parameters: [
          {
            name: "domain",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Domain availability",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DomainAvailability" },
              },
            },
          },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/domains/suggest/{query}": {
      get: {
        operationId: "suggestDomains",
        summary: "Get domain name suggestions",
        tags: ["Domains"],
        parameters: [
          {
            name: "query",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": {
            description: "Domain suggestions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      items: { $ref: "#/components/schemas/DomainAvailability" },
                    },
                  },
                  required: ["suggestions"],
                },
              },
            },
          },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/domains/prices/{tld}": {
      get: {
        operationId: "getTldPricing",
        summary: "Get pricing for a TLD",
        tags: ["Domains"],
        parameters: [
          {
            name: "tld",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "TLD pricing",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TldPricing" },
              },
            },
          },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/domains/register": {
      post: {
        operationId: "registerDomain",
        summary: "Register a domain (async)",
        tags: ["Domains"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  domain: { type: "string" },
                  contact: { type: "object" },
                  years: { type: "integer" },
                },
                required: ["domain", "contact"],
              },
            },
          },
        },
        responses: {
          "202": {
            description: "Registration accepted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DomainOperation" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/domains/operations/{id}": {
      get: {
        operationId: "getDomainOperation",
        summary: "Poll a domain operation",
        tags: ["Domains"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Operation status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DomainOperation" },
              },
            },
          },
          "402": { $ref: "#/components/responses/PaymentRequired" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
  },
};

writeFileSync(join(process.cwd(), "openapi.json"), JSON.stringify(spec, null, 2));
console.log("OpenAPI spec written to openapi.json");
