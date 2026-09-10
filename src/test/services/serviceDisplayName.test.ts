import { describe, expect, it } from "vitest";
import { serviceDisplayName } from "@/lib/serviceDisplayName";

describe("serviceDisplayName", () => {
  it("compõe serviço + aplicação", () => {
    expect(
      serviceDisplayName({ serviceName: "Hifu Hipro", applicationName: "Face - 1 sessão" }),
    ).toBe("Hifu Hipro - Face - 1 sessão");
  });

  it("omite o serviço quando a aplicação já começa com ele", () => {
    expect(
      serviceDisplayName({ serviceName: "Fios Aptos", applicationName: "Fios Aptos" }),
    ).toBe("Fios Aptos");
    expect(
      serviceDisplayName({ serviceName: "Avaliação", applicationName: "Avaliação Dermatofuncional" }),
    ).toBe("Avaliação Dermatofuncional");
  });

  it("ignora acento e caixa ao comparar", () => {
    expect(
      serviceDisplayName({ serviceName: "Toxina Botulínica", applicationName: "TOXINA BOTULINICA - AXILAS" }),
    ).toBe("TOXINA BOTULINICA - AXILAS");
  });

  it("omite o serviço em categoria direct", () => {
    expect(
      serviceDisplayName({
        serviceName: "Consultas",
        applicationName: "Consulta Clínica",
        categoryType: "direct",
      }),
    ).toBe("Consulta Clínica");
  });

  it("é idempotente", () => {
    const once = serviceDisplayName({ serviceName: "Hifu Hipro", applicationName: "Face - 1 sessão" });
    expect(serviceDisplayName({ serviceName: "Hifu Hipro", applicationName: once })).toBe(once);
  });

  it("aceita lados ausentes", () => {
    expect(serviceDisplayName({ serviceName: "Hifu Hipro", applicationName: null })).toBe("Hifu Hipro");
    expect(serviceDisplayName({ serviceName: null, applicationName: "Face - 1 sessão" })).toBe("Face - 1 sessão");
    expect(serviceDisplayName({})).toBe("");
  });
});
