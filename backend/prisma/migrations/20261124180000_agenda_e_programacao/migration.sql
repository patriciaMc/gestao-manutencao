ALTER TABLE "manutencao" ADD COLUMN "vistoria_agendada_em" TIMESTAMP(3);
CREATE INDEX "manutencao_status_vistoria_agendada_em_idx" ON "manutencao"("status", "vistoria_agendada_em");

CREATE TABLE "anotacao_tecnica" (
    "id" TEXT NOT NULL,
    "manutencao_id" TEXT NOT NULL REFERENCES "manutencao"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "autor_id" TEXT NOT NULL REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "anotacao_tecnica_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "anotacao_tecnica_manutencao_id_criado_em_idx" ON "anotacao_tecnica"("manutencao_id", "criado_em");

CREATE TYPE "TipoProgramacaoManutencao" AS ENUM ('PREVENTIVA', 'ALTERACAO_LAYOUT');
CREATE TABLE "programacao_manutencao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoProgramacaoManutencao" NOT NULL,
    "unidade_id" TEXT NOT NULL REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "titulo" TEXT NOT NULL,
    "observacoes" TEXT,
    "data_prevista" DATE NOT NULL,
    "concluida_em" TIMESTAMP(3),
    "criado_por_id" TEXT NOT NULL REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "programacao_manutencao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "programacao_manutencao_tipo_data_prevista_idx" ON "programacao_manutencao"("tipo", "data_prevista");
