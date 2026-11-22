-- Normalize legacy Google Flow version metadata into one namespaced object.
-- Version number and prompt are already first-class BackgroundImageVersion
-- columns, so they are not repeated inside providerMetadata.
WITH source AS (
  SELECT
    version."id",
    COALESCE(version."providerMetadata", '{}'::jsonb) AS metadata,
    jsonb_strip_nulls(
      jsonb_build_object(
        'projectId',
          COALESCE(
            NULLIF(version."providerMetadata" #>> '{googleFlow,projectId}', ''),
            NULLIF(version."providerMetadata" #>> '{googleFlow,googleFlowProjectId}', ''),
            NULLIF(version."providerMetadata" ->> 'googleFlowProjectId', '')
          ),
        'editId',
          COALESCE(
            NULLIF(version."providerMetadata" #>> '{googleFlow,editId}', ''),
            NULLIF(version."providerMetadata" #>> '{googleFlow,googleFlowEditId}', ''),
            NULLIF(version."providerMetadata" ->> 'googleFlowEditId', '')
          ),
        'editUrl',
          COALESCE(
            NULLIF(version."providerMetadata" #>> '{googleFlow,editUrl}', ''),
            NULLIF(version."providerMetadata" #>> '{googleFlow,googleFlowEditUrl}', ''),
            NULLIF(version."providerMetadata" ->> 'googleFlowEditUrl', '')
          ),
        'imageId',
          COALESCE(
            NULLIF(version."providerMetadata" #>> '{googleFlow,imageId}', ''),
            NULLIF(version."providerMetadata" #>> '{googleFlow,googleFlowImageId}', ''),
            NULLIF(version."providerMetadata" ->> 'googleFlowImageId', ''),
            NULLIF(version."providerMetadata" #>> '{googleFlow,editId}', ''),
            NULLIF(version."providerMetadata" ->> 'googleFlowEditId', '')
          ),
        'imageRef',
          COALESCE(
            NULLIF(version."providerMetadata" #>> '{googleFlow,imageRef}', ''),
            NULLIF(version."providerMetadata" #>> '{googleFlow,googleFlowImageRef}', ''),
            NULLIF(version."providerMetadata" ->> 'googleFlowImageRef', '')
          ),
        'imageSourceUrl',
          COALESCE(
            NULLIF(version."providerMetadata" #>> '{googleFlow,imageSourceUrl}', ''),
            NULLIF(version."providerMetadata" #>> '{googleFlow,googleFlowImageSourceUrl}', ''),
            NULLIF(version."providerMetadata" ->> 'googleFlowImageSourceUrl', ''),
            NULLIF(version."providerMetadata" #>> '{googleFlow,imageRef}', ''),
            NULLIF(version."providerMetadata" ->> 'googleFlowImageRef', '')
          ),
        'parentAssetId',
          COALESCE(
            NULLIF(version."providerMetadata" #>> '{googleFlow,parentAssetId}', ''),
            NULLIF(version."providerMetadata" #>> '{googleFlow,googleFlowParentAssetId}', ''),
            NULLIF(version."providerMetadata" ->> 'googleFlowParentAssetId', '')
          ),
        'prompt',
          CASE
            WHEN COALESCE(
              NULLIF(version."providerMetadata" #>> '{googleFlow,prompt}', ''),
              NULLIF(version."providerMetadata" #>> '{googleFlow,googleFlowPrompt}', ''),
              NULLIF(version."providerMetadata" ->> 'googleFlowPrompt', '')
            ) IS NOT NULL
            AND COALESCE(
              NULLIF(version."providerMetadata" #>> '{googleFlow,prompt}', ''),
              NULLIF(version."providerMetadata" #>> '{googleFlow,googleFlowPrompt}', ''),
              NULLIF(version."providerMetadata" ->> 'googleFlowPrompt', '')
            ) IS DISTINCT FROM version."prompt"
            THEN COALESCE(
              NULLIF(version."providerMetadata" #>> '{googleFlow,prompt}', ''),
              NULLIF(version."providerMetadata" #>> '{googleFlow,googleFlowPrompt}', ''),
              NULLIF(version."providerMetadata" ->> 'googleFlowPrompt', '')
            )
            ELSE NULL
          END
      )
    ) AS flow_metadata
  FROM "BackgroundImageVersion" AS version
  WHERE LOWER(REPLACE(version."provider", '-', '_')) = 'google_flow'
)
UPDATE "BackgroundImageVersion" AS target
SET "providerMetadata" =
  (
    source.metadata
      - 'googleFlow'
      - 'googleFlowProjectId'
      - 'googleFlowEditId'
      - 'googleFlowEditUrl'
      - 'googleFlowImageId'
      - 'googleFlowImageRef'
      - 'googleFlowImageSourceUrl'
      - 'googleFlowParentAssetId'
      - 'googleFlowPrompt'
      - 'googleFlowVersion'
  )
  ||
  CASE
    WHEN source.flow_metadata = '{}'::jsonb THEN '{}'::jsonb
    ELSE jsonb_build_object('googleFlow', source.flow_metadata)
  END
FROM source
WHERE target."id" = source."id";
