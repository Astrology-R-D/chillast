import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

// 查询 hooks only——mutations 由 Section 组件直接调 apiClient（与 AiStatusPanel 同模式），
// 避免造一层无人使用的包装（YAGNI）。
export const aiQueryKeys = {
  status: ['ai', 'status'] as const,
  catalogProviders: ['ai', 'catalog', 'providers'] as const,
  catalogModels: (providerKey: string) => ['ai', 'catalog', 'models', providerKey] as const,
  knowledge: ['ai', 'knowledge'] as const,
  tools: ['ai', 'tools'] as const,
  mcp: ['ai', 'mcp'] as const,
  sessions: ['ai', 'sessions'] as const,
};

export function useAiStatus() {
  return useQuery({ queryKey: aiQueryKeys.status, queryFn: apiClient.getAiStatus });
}

export function useAiCatalogProviders() {
  return useQuery({ queryKey: aiQueryKeys.catalogProviders, queryFn: apiClient.getAiCatalogProviders });
}

export function useAiCatalogModels(providerKey: string) {
  return useQuery({
    queryKey: aiQueryKeys.catalogModels(providerKey),
    queryFn: () => apiClient.getAiCatalogModels(providerKey),
    enabled: providerKey !== '',
  });
}

export function useKnowledgeDocs() {
  return useQuery({ queryKey: aiQueryKeys.knowledge, queryFn: apiClient.listKnowledgeDocs });
}

export function useAiToolProviders() {
  return useQuery({ queryKey: aiQueryKeys.tools, queryFn: apiClient.describeAiToolProviders });
}

export function useAiMcp() {
  return useQuery({ queryKey: aiQueryKeys.mcp, queryFn: apiClient.listAiMcp });
}

export function useAiSessions() {
  return useQuery({ queryKey: aiQueryKeys.sessions, queryFn: apiClient.listAiSessions });
}
