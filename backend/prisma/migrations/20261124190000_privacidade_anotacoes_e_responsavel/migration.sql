ALTER TABLE "anotacao_tecnica" ADD COLUMN "compartilhada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "manutencao" ADD COLUMN "vistoria_responsavel" TEXT;
