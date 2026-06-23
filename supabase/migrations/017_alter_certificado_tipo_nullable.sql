-- Migration: Make certificados.tipo nullable and drop its default value
ALTER TABLE public.certificados ALTER COLUMN tipo DROP NOT NULL;
ALTER TABLE public.certificados ALTER COLUMN tipo DROP DEFAULT;
