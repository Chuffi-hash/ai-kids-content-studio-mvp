-- Backfill the stable Google Flow media identifier for existing records.
-- Google Flow's editor URL is /project/{projectId}/edit/{editId}; when no
-- separate DOM image ID exists, the editId is the persisted image identifier.

UPDATE "Image"
SET "googleFlowImageId" = "googleFlowEditId"
WHERE "provider" = 'google_flow'
  AND ("googleFlowImageId" IS NULL OR "googleFlowImageId" = '')
  AND "googleFlowEditId" IS NOT NULL
  AND "googleFlowEditId" <> '';

UPDATE "BackgroundImageVersion"
SET "providerMetadata" = jsonb_set(
  COALESCE("providerMetadata", '{}'::jsonb),
  '{googleFlowImageId}',
  to_jsonb("providerMetadata" ->> 'googleFlowEditId'),
  true
)
WHERE "provider" = 'google_flow'
  AND ("providerMetadata" ->> 'googleFlowImageId' IS NULL
       OR "providerMetadata" ->> 'googleFlowImageId' = '')
  AND NULLIF("providerMetadata" ->> 'googleFlowEditId', '') IS NOT NULL;

UPDATE "BackgroundImageVersion"
SET "providerMetadata" = jsonb_set(
  COALESCE("providerMetadata", '{}'::jsonb),
  '{googleFlowVersion}',
  to_jsonb("version"),
  true
)
WHERE "provider" = 'google_flow'
  AND ("providerMetadata" ->> 'googleFlowVersion' IS NULL
       OR "providerMetadata" ->> 'googleFlowVersion' = '');

UPDATE "Scene"
SET "animationData" = jsonb_set(
  "animationData",
  '{background,googleFlowImageId}',
  to_jsonb("animationData" #>> '{background,googleFlowEditId}'),
  true
)
WHERE jsonb_typeof("animationData") = 'object'
  AND jsonb_typeof("animationData" -> 'background') = 'object'
  AND ("animationData" #>> '{background,googleFlowImageId}' IS NULL
       OR "animationData" #>> '{background,googleFlowImageId}' = '')
  AND NULLIF("animationData" #>> '{background,googleFlowEditId}', '') IS NOT NULL;
