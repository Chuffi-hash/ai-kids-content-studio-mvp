-- Backfill Scene.order from Scene.number for existing scenes where order is 0 and number is set
UPDATE "Scene"
SET "order" = "number"
WHERE "order" = 0 AND "number" > 0;
