CREATE TABLE "contrato_movimento" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "ordem" BIGSERIAL NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contrato_movimento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contrato_movimento_contrato_id_fkey" FOREIGN KEY ("contrato_id")
        REFERENCES "contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "contrato_movimento_contrato_id_ordem_idx"
    ON "contrato_movimento"("contrato_id", "ordem");

ALTER TABLE "contrato_item" ADD COLUMN "modalidade" "TipoManutencao",
    ADD COLUMN "categoria_civil_id" TEXT, ADD COLUMN "categoria_equipamento_id" TEXT;
ALTER TABLE "contrato_item" ADD CONSTRAINT "contrato_item_categoria_civil_id_fkey"
    FOREIGN KEY ("categoria_civil_id") REFERENCES "categoria_civil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contrato_item" ADD CONSTRAINT "contrato_item_categoria_equipamento_id_fkey"
    FOREIGN KEY ("categoria_equipamento_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
