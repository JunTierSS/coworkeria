// Configuración del backend - todo via env vars del server
export const config = {
  n8nUrl: process.env.N8N_URL || "http://localhost:5678",
  chromaUrl: process.env.CHROMA_URL || "http://localhost:8000",
  chromaCollectionId: process.env.CHROMA_COLLECTION_ID || "",
  chromaTenant: "default_tenant",
  chromaDatabase: "default_database",
};

export const chromaBase = () =>
  `${config.chromaUrl}/api/v2/tenants/${config.chromaTenant}/databases/${config.chromaDatabase}/collections/${config.chromaCollectionId}`;
