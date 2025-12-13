-- Adicionar coluna profile_pic_url se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'profile_pic_url') THEN
        ALTER TABLE "contacts" ADD COLUMN "profile_pic_url" TEXT;
    END IF;
END $$;
