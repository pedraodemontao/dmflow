import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Existe um package-lock.json na home do usuário; sem isso o Turbopack
  // elege a home como raiz do workspace.
  turbopack: { root: __dirname },
  // Sem isso o dev server bloqueia os assets de desenvolvimento quando a página
  // é aberta pelo domínio do Tailscale Funnel, e a página não hidrata.
  allowedDevOrigins: ["macbook-air-de-pedro.tailfa5da9.ts.net"],
  // O upload de imagem de publicação passa por server action (8 MB é o teto
  // da Meta) e o padrão do Next é 1 MB. Folga para o overhead do multipart.
  // Vídeo NÃO passa por aqui: vai direto ao bucket por URL assinada.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
