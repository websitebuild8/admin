BEGIN;

CREATE TABLE "MenuImage" (
    "id" TEXT NOT NULL,
    "ownerKind" TEXT NOT NULL CHECK ("ownerKind" IN ('restaurant','demo')),
    "ownerId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Uploading' CHECK ("state" IN ('Uploading','Ready','Attached','Deleting','Deleted')),
    "path" TEXT NOT NULL,
    "thumbnailPath" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "attachedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MenuImage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MenuImage_path_key" ON "MenuImage"("path");
CREATE UNIQUE INDEX "MenuImage_thumbnailPath_key" ON "MenuImage"("thumbnailPath");
CREATE INDEX "MenuImage_ownerKind_ownerId_createdAt_idx" ON "MenuImage"("ownerKind", "ownerId", "createdAt");
CREATE INDEX "MenuImage_state_updatedAt_idx" ON "MenuImage"("state", "updatedAt");
ALTER TABLE "MenuItem" ADD COLUMN "imageId" TEXT;
CREATE UNIQUE INDEX "MenuItem_imageId_key" ON "MenuItem"("imageId");
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "MenuImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MenuImage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "MenuImage" FROM anon, authenticated;

-- Food photography is public. Direct client writes/listing remain blocked even
-- if this project has broad permissive policies for an unrelated bucket.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
      VALUES ('igo-menu-images','igo-menu-images',true,2097152,ARRAY['image/webp'])
      ON CONFLICT (id) DO UPDATE SET public=true,file_size_limit=2097152,allowed_mime_types=ARRAY['image/webp'];
    EXECUTE 'CREATE POLICY igo_menu_images_objects_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated USING (bucket_id <> ''igo-menu-images'') WITH CHECK (bucket_id <> ''igo-menu-images'')';
    EXECUTE 'CREATE POLICY igo_menu_images_bucket_server_only ON storage.buckets AS RESTRICTIVE FOR ALL TO anon, authenticated USING (id <> ''igo-menu-images'') WITH CHECK (id <> ''igo-menu-images'')';
  END IF;
END $$;

COMMIT;
