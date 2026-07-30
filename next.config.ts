import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Existe um package-lock.json na home do usuário; sem isso o Turbopack
  // elege a home como raiz do workspace.
  turbopack: { root: __dirname },
  // Sem isso o dev server bloqueia os assets de desenvolvimento quando a página
  // é aberta pelo domínio do Tailscale Funnel, e a página não hidrata.
  allowedDevOrigins: ["macbook-air-de-pedro.tailfa5da9.ts.net"],
};

export default nextConfig;
