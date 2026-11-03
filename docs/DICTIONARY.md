# Capture One scripting dictionary (16.9.0.10)

Generated from the installed app's `CaptureOne.sdef` by `scripts/gen-dictionary.py`. Do not hand-edit.

Tier markers come from the dictionary itself: **PRO** = Capture One Pro only, **CH** = Cultural Heritage, **Enterprise** = Enterprise only.

## Commands

### `add inside`
- target: `collection`
- param `variants`: `variant[]` (**required**)

Add one or more variants to an album collection.

### `add variant`
- target: `image`
- param `additive select`: `boolean` (optional)
- returns: `boolean`

Add a new Variant eg. "tell myImage to add variant"

### `adjust focus`
- target: `camera`
- param `by amount`: `integer` (**required**)
- param `sync`: `boolean` (optional)

Adjust the camera focus.

### `apply LCC`
- target: `variant`
- param `to`: `variant[]` (**required**)

Apply lens cast correction from a variant to one or more other variants.

### `apply adjustments`
- target: `variant`

Apply adjustments to a variant from its parent document's settings clipboard.

### `apply keyword`
- target: `keyword`
- param `to`: `variant[]` (**required**)

Apply an existing keyword to one or more variants.

### `apply normalize`
- target: `variant`
- param `at`: `point` (**required**)
- param `adjust white balance`: `boolean` (optional)
- param `adjust exposure`: `boolean` (optional)

Apply the document's “normalize target color” to a point on a variant.  The default normalization types are as defined in the UI, but may be overridden using the below optional parameters.

### `apply style`
- target: `layer`
- param `named`: `text` (**required**)

Apply a style or preset to a layer.

### `apply workspace`
- target: `text`

Load and apply a workspace.

### `autoadjust`
- target: `variant`
- param `adjust white balance`: `boolean` (optional)
- param `adjust exposure`: `boolean` (optional)
- param `adjust contrast brightness`: `boolean` (optional)
- param `adjust hdr`: `boolean` (optional)
- param `adjust levels`: `boolean` (optional)
- param `adjust rotation`: `boolean` (optional)
- param `adjust keystone`: `boolean` (optional)

Automatically adjust a variant's settings. The default types of adjustments that will be performed are as defined in the UI, but may be overridden using the below optional parameters.

### `autocrop`  _(CH only)_
- target: `variant`

Auto crop a variant

### `backup now`
- target: `document`
- param `location`: `text | file` (optional)
- param `test integrity`: `boolean` (optional)
- param `optimize`: `boolean` (optional)

Perform an immediate document backup (catalogs only). The default functionality is as defined in the user interface, but may be overridden using the below optional parameters.

### `batch rename`
- target: `document`
- param `variants`: `variant[]` (**required**)

Perform a batch rename according to what is defined in the document's batch rename settings.

### `begin live view`

Open Live View for the currently selected camera.

### `browse`
- target: `document`
- param `to path`: `text` (**required**)

Change the folder being browsed.

### `capture`  _(PRO only)_

Try to start capturing with the currently selected camera into the foreground document.  Follow with a delay command in order to allow the image to be fully captured before continuing in the same script.

### `change selection`
- target: `document`
- param `to`: `select type` (**required**)

Change the document's selection by the specified type.

### `clear compare`
- target: `collection`

Clear a collection's compare variant.

### `clear luma range`
- target: `layer`

Clear the luma range from a layer.

### `clear mask`
- target: `layer`

Clear the mask of a layer.

### `click mouse`
- target: `integer[]`

click the mouse at the specified location

### `clone variant`
- target: `variant`
- param `additive select`: `boolean` (optional)
- returns: `variant`

Clone a variant

### `copy adjustments`
- target: `variant`

Copy a variant's adjustments to its parent document's settings clipboard.

### `copy mask`
- target: `layer`
- param `to layer`: `layer` (**required**)

Copy the mask of a layer.

### `create LCC`
- target: `variant`
- param `dust removal`: `boolean` (optional)
- param `wide angle`: `boolean` (optional)

Create lens cast correction from this variant.

### `create people mask`
- target: `variant`
- param `areas`: `people mask area[]` (optional)
- param `separate layers`: `boolean` (optional)
- returns: `layer[]`

Create AI people masks for a variant as new layers.

### `create template`
- target: `document`
- param `named`: `text` (**required**)

Create a named template using this document. Will quietly overwrite an existing template of the same name.

### `decrement`
- target: `attribute`

Increment the value of the camera attribute.

### `demote`
- target: `variant`

Demote a variant among its clones.

### `deselect`
- target: `document`
- param `variant`: `variant` (optional)
- param `variants`: `variant[]` (optional)

Remove one or more variants from the current collection's selection.

### `end live view`

Close Live View for the currently selected camera.

### `export originals`
- target: `document`
- param `variants`: `variant[]` (**required**)

Perform an image export according to what is defined in the document's export originals settings.

### `feather mask`
- target: `layer`
- param `amount`: `real` (**required**)

Feather the mask of a layer.

### `fill mask`
- target: `layer`

Fill the mask of a layer.

### `import`
- target: `document | keyword library`
- param `source`: `text[] | file[]` (**required**)

Perform an import. If importing into a document, imports images according to what is defined in the document's import settings.

### `increment`
- target: `attribute`

Increment the value of the camera attribute.

### `invert mask`
- target: `layer`

Invert the mask of a layer.

### `maximum crop`
- target: `variant`
- param `horizontal`: `boolean` (optional)
- param `vertical`: `boolean` (optional)
- param `apply`: `boolean` (optional)
- returns: `rectangle`

Determine the maximum crop for a variant.

### `migrate`
- target: `text | file`

Migrate a Capture One document (if necessary) to the current format.

### `move inside`
- target: `collection`
- param `variants`: `variant[]` (**required**)

Move one or more variants into a collection (favorite or folder).

### `pack`
- target: `image`

Pack an image into an Enhanced Image Package file.

### `pick dehaze`
- target: `adjustment settings`
- param `at`: `point` (**required**)

Set the adjustment “dehaze color” from a point on a variant.

### `pick normalize`
- target: `variant`
- param `at`: `point` (**required**)

Set the document's “normalize target color” from a point on a variant.

### `process`  _(PRO only)_
- target: `variant | text | file | variant[]`
- param `recipe`: `text` (optional)
- returns: `text`

Process a variant, or the variants of a RAW file

### `promote`
- target: `variant`

Promote a variant among its clones.

### `rasterize mask`
- target: `layer`

Rasterize the mask of a layer.

### `recalculate dehaze`
- target: `adjustment settings`

Set the adjustment “dehaze color” automatically.

### `refine mask`
- target: `layer`
- param `amount`: `real` (**required**)

Refine the mask of a layer.

### `refresh`
- target: `document`

Refresh the document's display.

### `relink`
- target: `image`
- param `to path`: `text` (**required**)

Relink a catalog image file.  The file must be the exact same size and type as the originally imported image.

### `reload metadata`
- target: `variant`

Reload a variant's source file metadata.

### `repack`
- target: `image`

Synchronously write a packed image's full state. Does nothing if the image is not packed.

### `reset`
- target: `item`

Reset settings to defaults.

### `reset adjustments`
- target: `variant`

Reset the adjustment settings of a variant.

### `reset assisted review`
- target: `document`
- param `variants`: `variant[]` (**required**)

Clear Assisted Review results from the given variants.

### `review variants`
- target: `document`
- param `variants`: `variant[]` (**required**)
- param `eyes state`: `boolean` (optional)
- param `eyes focus`: `boolean` (optional)
- param `exposure`: `boolean` (optional)

Run Assisted Review analysis on the given variants. When eyes state, eyes focus or exposure are omitted, uses the current Assisted Review settings.

### `rotate left`
- target: `variant`

Rotate the variant left 90 degrees.

### `rotate right`
- target: `variant`

Rotate the variant right 90 degrees.

### `save`
- target: `document`

Save the document, writing any pending variant edits (ratings, color tags, crops and adjustments) to the session, and wait until the save has completed.  Use this before moving, renaming or adding files on disk, or before changing the capture folder, to guarantee that in-memory edits are persisted first.

### `select`
- target: `document`
- param `variant`: `variant` (optional)
- param `variants`: `variant[]` (optional)

Add one or more variants to the current collection's selection.

### `select camera`
- target: `document`
- param `name`: `text` (**required**)

Select a tethered camera to use by name or identifier.  Follow with a delay command in order to use the chosen camera immediately afterward in the same script.  Use an empty name ("") in order to select no camera.

### `show`
- target: `item`

Show this on any attached Live for Studio.

### `silently quit`

Quit silently by automatically terminating any current activities (e.g. importing, exporting, Live View) and skipping any backup prompts that would normally appear.

### `sync metadata`
- target: `variant`

Sync a variant's metadata back to its source file.

### `synchronize`
- target: `collection`
- param `subfolders`: `boolean` (optional)
- param `only include previously added subfolders`: `boolean` (optional)
- param `importing`: `boolean` (optional)
- param `removing`: `boolean` (optional)

Perform imports and/or deletes in a folder collection to reflect the contents of the actual folder on disk.  All parameters below are optional.

### `telemetry`
- param `value`: `text` (**required**)

### `unpack`
- target: `image`

Unpack an image from an Enhanced Image Package file.

### `upgrade engine`
- target: `variant`

Upgrade a variant's processing engine to the current version.  Warning: cannot be undone.

## Classes

### `application`
_inherits from `application`_

- contains: `document`, `image`, `variant`, `keyword library`

| property | type | access |
| --- | --- | --- |
| `current document` | `document` | rw |
| `viewer` | `viewer configuration` | rw |
| `progress total units` | `integer` | rw |
| `progress completed units` | `integer` | rw |
| `progress text` | `text` | rw |
| `progress additional text` | `text` | rw |
| `capture done script` | `text | file` | rw |
| `processing done script` | `text | file` | rw |
| `batch done script` | `text | file` | rw |
| `live view became ready script` | `text | file` | rw |
| `live view will close script` | `text | file` | rw |
| `live view done script` | `text | file` | rw |
| `importing done script` | `text | file` | rw |
| `barcode scanned script` | `text | file` | rw |
| `primary variant adjusted script` | `text | file` | rw |
| `selection changed script` | `text | file` | rw |
| `selected variants` | `variant[]` | read-only |
| `all variants` | `variant[]` | read-only |
| `rate auto advance` | `boolean` | rw |
| `tag auto advance` | `boolean` | rw |
| `assisted review during tethering` | `boolean` | rw |
| `app version` | `text` | read-only |
| `primary variant` | `variant` | read-only |
| `next capture adjustments` | `nextcaptureadjustments` | rw |
| `shutter latency` | `shutterlatency` | rw |
| `display acceleration` | `openCLStatus` | rw |
| `processing acceleration` | `openCLStatus` | rw |
| `edit all selected variants` | `boolean` | rw |
| `live view status` | `liveViewStatus` | rw |
| `available styles` | `text[]` | read-only |
| `test name` | `text` | rw |
| `compare enabled` | `boolean` | rw |
| `compare mode` | `compareModes` | rw |

### `document`
- contains: `image`, `recipe`, `job`, `collection`, `variant`, `keyword`, `tool tab`, `toolbar item`, `client viewer`, `user crop aspect ratio`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | read-only |
| `id` | `text` | read-only |
| `window toolbar mode` | `toolbarDisplayMode` | rw |
| `window toolbar` | `boolean` | rw |
| `current collection` | `collection` | rw |
| `current recipe` | `recipe` | rw |
| `show enabled recipes only` | `boolean` | rw |
| `template` | `text` | read-only |
| `path` | `text | file` | read-only |
| `folder` | `file` | read-only |
| `kind` | `documentType` | read-only |
| `filters` | `text[]` | rw |
| `available filters` | `text[]` | read-only |
| `output` | `text | file` | rw |
| `output sub path` | `text` | rw |
| `output job name token` | `text` | rw |
| `output subfolder token` | `text` | rw |
| `output counter` | `integer` | rw |
| `output counter increment` | `integer` | rw |
| `captures` | `text | file` | rw |
| `selects` | `text | file` | rw |
| `trash` | `text | file` | rw |
| `barcode` | `text` | rw |
| `all variants` | `variant[]` | read-only |
| `crop aspect ratio` | `text` | rw |
| `processing queue enabled` | `boolean` | rw |
| `document window` | `window` | rw |
| `tool settings` | `tools configuration` | rw |
| `viewer` | `viewer configuration` | rw |
| `browser` | `browser configuration` | rw |
| `output name format` | `text` | rw |
| `output name` | `text` | rw |
| `import counter` | `integer` | rw |
| `capture counter` | `integer` | rw |
| `capture counter increment` | `integer` | rw |
| `capture name format` | `text` | rw |
| `capture name` | `text` | rw |
| `last captured file` | `file` | read-only |
| `normalize target color` | `RGB color` | rw |
| `camera` | `camera` | read-only |
| `available camera identifiers` | `text[]` | read-only |
| `auto select new capture` | `auto select mode` | rw |
| `auto select new capture pause` | `boolean` | rw |
| `workspace lock PIN` | `text` | write-only |
| `copy stand` | `control device` | read-only |
| `batch rename settings` | `batch rename options` | rw |
| `import settings` | `import options` | rw |
| `export original settings` | `export original options` | rw |
| `next capture settings` | `next capture options` | rw |
| `overlay settings` | `overlay options` | rw |
| `server settings` | `server options` | rw |
| `served variant` | `variant` | read-only |
| `grid settings` | `grid options` | rw |
| `guide settings` | `guide options` | rw |

### `toolbar item`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | read-only |
| `id` | `text` | read-only |

### `tool tab`
- contains: `tool`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | read-only |
| `id` | `text` | read-only |
| `icon number` | `integer` | read-only |
| `selected` | `boolean` | rw |

### `tool`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | read-only |
| `id` | `text` | read-only |
| `expanded` | `boolean` | rw |
| `pinned` | `boolean` | rw |
| `locked` | `boolean` | rw |

### `camera`
- contains: `attribute`, `focus meter`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | read-only |
| `identifier` | `text` | read-only |
| `wireless` | `boolean` | read-only |
| `retether` | `boolean` | rw |
| `format` | `text` | rw |
| `sensor plus` | `text` | rw |
| `image area` | `text` | rw |
| `live width` | `integer` | read-only |
| `live height` | `integer` | read-only |
| `ISO` | `text` | rw |
| `white balance` | `text` | rw |
| `program` | `text` | rw |
| `exposure step` | `text` | rw |
| `shutter speed` | `text` | rw |
| `aperture` | `text` | rw |
| `EV adjustment` | `text` | rw |
| `flash mode` | `text` | rw |
| `metering mode` | `text` | rw |
| `meter value` | `text` | read-only |
| `focus indicator` | `focus indication` | read-only |
| `autofocusing` | `boolean` | rw |
| `available formats` | `text` | read-only |
| `available sensor plus settings` | `text` | read-only |
| `available image area settings` | `text` | read-only |
| `available ISO settings` | `text` | read-only |
| `available white balance settings` | `text` | read-only |
| `available programs` | `text` | read-only |
| `available exposure steps` | `text` | read-only |
| `available shutter speeds` | `text` | read-only |
| `available aperture settings` | `text` | read-only |
| `available EV adjustments` | `text` | read-only |
| `available flash modes` | `text` | read-only |
| `available metering modes` | `text` | read-only |

### `control device`

| property | type | access |
| --- | --- | --- |
| `calibrated` | `boolean` | read-only |
| `calibrating` | `boolean` | rw |
| `resolution settings` | `real[]` | rw |
| `resolution` | `real` | rw |
| `position` | `real` | rw |

### `focus meter`

| property | type | access |
| --- | --- | --- |
| `width` | `integer` | rw |
| `height` | `integer` | rw |
| `horizontal position` | `integer` | rw |
| `vertical position` | `integer` | rw |
| `amount` | `real` | read-only |
| `peak amount` | `real` | read-only |

### `attribute`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | read-only |
| `read only` | `boolean` | read-only |
| `user level` | `attributeUserLevel` | read-only |
| `available values` | `text` | read-only |
| `value` | `text` | rw |

### `collection`
- contains: `collection`, `image`, `variant`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | read-only |
| `id` | `text` | read-only |
| `kind` | `collectionType` | read-only |
| `user` | `boolean` | read-only |
| `synchronizing` | `boolean` | rw |
| `folder` | `text | file` | read-only |
| `file` | `file` | read-only |
| `rules` | `text` | read-only |
| `sorting order` | `sort order` | rw |
| `sorting reversed` | `boolean` | rw |
| `compare variant` | `variant` | rw |
| `compare variants` | `variant[]` | rw |

### `recipe`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | rw |
| `enabled` | `boolean` | rw |
| `output format` | `recipeFileFormat` | rw |
| `bits` | `integer` | rw |
| `JPEG quality` | `integer` | rw |
| `TIFF compression` | `tiffCompress` | rw |
| `TIFF thumbnail` | `boolean` | rw |
| `TIFF tile dimension` | `integer` | rw |
| `color profile` | `text` | rw |
| `pixels per inch` | `number` | rw |
| `scaling method` | `scalingType` | rw |
| `scaling unit` | `measurementUnit` | rw |
| `primary scaling value` | `number` | rw |
| `secondary scaling value` | `number` | rw |
| `upscale` | `boolean` | rw |
| `packed` | `boolean` | rw |
| `include adjustments` | `boolean` | rw |
| `app` | `text | file` | rw |
| `root folder type` | `recipeRootType` | rw |
| `root folder location` | `file` | rw |
| `output name format` | `text` | rw |
| `output sub name` | `text` | rw |
| `output sub folder` | `text` | rw |
| `existing files` | `existing files behavior` | rw |
| `thumbnails` | `boolean` | rw |
| `sharpening` | `sharpening type` | rw |
| `sharpening amount` | `real` | rw |
| `sharpening radius` | `real` | rw |
| `sharpening threshold` | `real` | rw |
| `sharpening distance` | `real` | rw |
| `sharpening distance type` | `distance type` | rw |
| `ignore crop` | `boolean` | rw |
| `export crop method` | `export crop method` | rw |
| `include keywords` | `text[]` | rw |
| `include ratings` | `boolean` | rw |
| `include copyright` | `boolean` | rw |
| `include GPS` | `boolean` | rw |
| `include Camera Metadata` | `boolean` | rw |
| `include Other Metadata` | `boolean` | rw |
| `include annotations` | `boolean` | rw |
| `include overlay` | `boolean` | rw |
| `include guides` | `boolean` | rw |
| `watermark` | `watermark` | rw |

### `watermark`

| property | type | access |
| --- | --- | --- |
| `kind` | `watermarkKind` | rw |
| `image` | `text` | rw |
| `label` | `text` | rw |
| `color` | `RGB color` | rw |
| `size` | `integer` | rw |
| `font` | `text` | rw |
| `opacity` | `integer` | rw |
| `scale` | `integer` | rw |
| `x` | `number` | rw |
| `y` | `number` | rw |

### `job`
- contains: `recipe`

| property | type | access |
| --- | --- | --- |
| `id` | `text` | read-only |
| `image name` | `text` | read-only |
| `image path` | `text` | read-only |

### `keyword library`
- contains: `keyword`

| property | type | access |
| --- | --- | --- |
| `id` | `text` | read-only |
| `name` | `text` | read-only |

### `keyword`

| property | type | access |
| --- | --- | --- |
| `id` | `text` | read-only |
| `name` | `text` | read-only |
| `parent` | `text` | read-only |

### `user crop aspect ratio`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | read-only |
| `ratio` | `real` | read-only |

### `readout`

| property | type | access |
| --- | --- | --- |
| `horizontal position` | `real` | read-only |
| `vertical position` | `real` | read-only |
| `red` | `integer` | read-only |
| `green` | `integer` | read-only |
| `blue` | `integer` | read-only |
| `lightness` | `integer` | read-only |
| `cyan` | `integer` | read-only |
| `magenta` | `integer` | read-only |
| `yellow` | `integer` | read-only |
| `black` | `integer` | read-only |
| `gray` | `integer` | read-only |
| `Lab L` | `real` | read-only |
| `Lab a` | `real` | read-only |
| `Lab b` | `real` | read-only |

### `layer`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | rw |
| `kind` | `layer type` | read-only |
| `enabled` | `boolean` | rw |
| `opacity` | `integer` | rw |
| `adjustments` | `adjustment settings` | rw |
| `luma range` | `luma range settings` | rw |

### `luma range settings`

| property | type | access |
| --- | --- | --- |
| `range low` | `real` | rw |
| `range high` | `real` | rw |
| `falloff low` | `real` | rw |
| `falloff high` | `real` | rw |
| `invert` | `boolean` | rw |
| `radius` | `real` | rw |
| `sensitivity` | `real` | rw |

### `variant`
- contains: `keyword`, `layer`, `readout`, `output event`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | read-only |
| `id` | `text` | read-only |
| `parent image` | `image` | read-only |
| `file` | `file` | read-only |
| `current layer` | `layer` | rw |
| `pick` | `boolean` | rw |
| `position` | `integer` | read-only |
| `selected` | `boolean` | read-only |
| `visible` | `boolean` | read-only |
| `queued` | `boolean` | read-only |
| `processing mode` | `technical processing mode` | rw |
| `color system` | `curve color system` | rw |
| `engine` | `integer` | read-only |
| `adjustments` | `adjustment settings` | rw |
| `styles` | `text[]` | rw |
| `exposure meter` | `real` | read-only |
| `color tag` | `integer` | rw |
| `rating` | `integer` | rw |
| `contact creator` | `text` | rw |
| `contact creator job title` | `text` | rw |
| `contact address` | `text` | rw |
| `contact city` | `text` | rw |
| `contact state` | `text` | rw |
| `contact postal code` | `text` | rw |
| `contact country` | `text` | rw |
| `contact phone` | `text` | rw |
| `contact email` | `text` | rw |
| `contact website` | `text` | rw |
| `content headline` | `text` | rw |
| `content description` | `text` | rw |
| `content category` | `text` | rw |
| `content supplemental categories` | `text` | rw |
| `content subject codes` | `text` | rw |
| `content description writer` | `text` | rw |
| `image intellectual genre` | `text` | rw |
| `image scenes` | `text` | rw |
| `image location` | `text` | rw |
| `image city` | `text` | rw |
| `image state` | `text` | rw |
| `image country` | `text` | rw |
| `image country code` | `text` | rw |
| `status title` | `text` | rw |
| `status job identifier` | `text` | rw |
| `status instructions` | `text` | rw |
| `status provider` | `text` | rw |
| `status source` | `text` | rw |
| `status copyright notice` | `text` | rw |
| `status rights usage terms` | `text` | rw |
| `Getty personalities` | `text` | rw |
| `Getty original filename` | `text` | rw |
| `Getty parent MEID` | `text` | rw |
| `latitude` | `real` | read-only |
| `longitude` | `real` | read-only |
| `altitude` | `real` | read-only |
| `lens correction` | `lens correction settings` | rw |
| `applied LCC name` | `text` | read-only |
| `LCC color cast` | `boolean` | rw |
| `LCC dust removal` | `boolean` | rw |
| `LCC uniform light` | `boolean` | rw |
| `LCC uniform light amount` | `integer` | rw |
| `crop` | `rectangle` | rw |
| `available crop aspect ratios` | `text[]` | read-only |
| `crop aspect ratio` | `text` | rw |
| `crop orientation` | `crop aspect ratio orientation` | rw |
| `crop size` | `point` | rw |
| `crop width` | `integer` | rw |
| `crop height` | `integer` | rw |
| `crop center` | `point` | rw |
| `crop centerX` | `integer` | rw |
| `crop centerY` | `integer` | rw |
| `crop outside image` | `boolean` | rw |
| `assisted review eyes state` | `assisted review eyes state` | read-only |
| `assisted review eyes focus` | `assisted review eyes focus` | read-only |
| `assisted review exposure` | `assisted review exposure` | read-only |

### `lens correction settings`

| property | type | access |
| --- | --- | --- |
| `lens profile` | `text` | rw |
| `chromatic aberration` | `boolean` | rw |
| `custom chromatic aberration` | `boolean` | rw |
| `diffraction correction` | `boolean` | rw |
| `hide distorted areas` | `boolean` | rw |
| `distortion` | `real` | rw |
| `sharpness falloff` | `real` | rw |
| `light falloff` | `real` | rw |
| `focal length` | `integer` | rw |
| `aperture` | `real` | rw |
| `tilt` | `real` | rw |
| `tilt direction` | `real` | rw |
| `shift` | `real` | rw |
| `shift direction` | `real` | rw |
| `shift x` | `integer` | rw |
| `shift y` | `integer` | rw |

### `curve`
- contains: `curve point`

### `curve point`

| property | type | access |
| --- | --- | --- |
| `brightness` | `real` | rw |
| `amount` | `real` | rw |

### `adjustment settings`

| property | type | access |
| --- | --- | --- |
| `orientation` | `integer` | rw |
| `rotation` | `real` | rw |
| `flip` | `flip type` | rw |
| `keystone amount` | `integer` | rw |
| `keystone vertical` | `real` | rw |
| `keystone horizontal` | `real` | rw |
| `keystone skew` | `real` | rw |
| `keystone aspect` | `real` | rw |
| `color profile` | `text` | rw |
| `film curve` | `text` | rw |
| `white balance preset` | `text` | rw |
| `temperature` | `real` | rw |
| `tint` | `real` | rw |
| `exposure` | `real` | rw |
| `brightness` | `real` | rw |
| `contrast` | `real` | rw |
| `saturation` | `real` | rw |
| `color balance master hue` | `real` | rw |
| `color balance master saturation` | `real` | rw |
| `color balance shadow hue` | `real` | rw |
| `color balance shadow saturation` | `real` | rw |
| `color balance shadow lightness` | `real` | rw |
| `color balance midtone hue` | `real` | rw |
| `color balance midtone saturation` | `real` | rw |
| `color balance midtone lightness` | `real` | rw |
| `color balance highlight hue` | `real` | rw |
| `color balance highlight saturation` | `real` | rw |
| `color balance highlight lightness` | `real` | rw |
| `black and white` | `boolean` | rw |
| `black and white red sensitivity` | `integer` | rw |
| `black and white yellow sensitivity` | `integer` | rw |
| `black and white green sensitivity` | `integer` | rw |
| `black and white cyan sensitivity` | `integer` | rw |
| `black and white blue sensitivity` | `integer` | rw |
| `black and white magenta sensitivity` | `integer` | rw |
| `black and white split highlight hue` | `integer` | rw |
| `black and white split highlight saturation` | `integer` | rw |
| `black and white split shadow hue` | `integer` | rw |
| `black and white split shadow saturation` | `integer` | rw |
| `color editor settings` | `color editor options` | rw |
| `level highlight rgb` | `real` | rw |
| `level shadow rgb` | `real` | rw |
| `level highlight red` | `real` | rw |
| `level shadow red` | `real` | rw |
| `level highlight green` | `real` | rw |
| `level shadow green` | `real` | rw |
| `level highlight blue` | `real` | rw |
| `level shadow blue` | `real` | rw |
| `level target highlight rgb` | `real` | rw |
| `level target shadow rgb` | `real` | rw |
| `level target highlight red` | `real` | rw |
| `level target shadow red` | `real` | rw |
| `level target highlight green` | `real` | rw |
| `level target shadow green` | `real` | rw |
| `level target highlight blue` | `real` | rw |
| `level target shadow blue` | `real` | rw |
| `level midtone rgb` | `real` | rw |
| `level midtone red` | `real` | rw |
| `level midtone green` | `real` | rw |
| `level midtone blue` | `real` | rw |
| `rgb curve` | `curve` | rw |
| `luma curve` | `curve` | rw |
| `red curve` | `curve` | rw |
| `green curve` | `curve` | rw |
| `blue curve` | `curve` | rw |
| `highlight recovery` | `real` | rw |
| `highlight adjustment` | `real` | rw |
| `shadow recovery` | `real` | rw |
| `white recovery` | `real` | rw |
| `black recovery` | `real` | rw |
| `clarity method` | `clarity method` | rw |
| `clarity amount` | `real` | rw |
| `clarity structure` | `real` | rw |
| `dehaze amount` | `real` | rw |
| `dehaze color` | `RGB color` | rw |
| `vignetting amount` | `real` | rw |
| `vignetting method` | `vignette method` | rw |
| `sharpening amount` | `real` | rw |
| `sharpening radius` | `real` | rw |
| `sharpening threshold` | `real` | rw |
| `sharpening halo suppression` | `real` | rw |
| `noise reduction luminance` | `real` | rw |
| `noise reduction details` | `integer` | rw |
| `noise reduction color` | `real` | rw |
| `noise reduction single pixel` | `real` | rw |
| `film grain type` | `grain type` | rw |
| `film grain impact` | `real` | rw |
| `film grain granularity` | `real` | rw |
| `moire amount` | `real` | rw |
| `moire pattern` | `integer` | rw |

### `color editor options`
- contains: `basic color correction`, `advanced color correction`

### `basic color correction`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | read-only |
| `hue change` | `real` | rw |
| `saturation change` | `real` | rw |
| `lightness change` | `real` | rw |

### `advanced color correction`

| property | type | access |
| --- | --- | --- |
| `enabled` | `boolean` | rw |
| `red` | `integer` | rw |
| `green` | `integer` | rw |
| `blue` | `integer` | rw |
| `target red` | `integer` | rw |
| `target green` | `integer` | rw |
| `target blue` | `integer` | rw |
| `hue start` | `real` | rw |
| `hue end` | `real` | rw |
| `saturation start` | `real` | rw |
| `saturation end` | `real` | rw |
| `smoothness` | `real` | rw |
| `hue change` | `real` | rw |
| `saturation change` | `real` | rw |
| `lightness change` | `real` | rw |
| `hue uniformity` | `real` | rw |
| `saturation uniformity` | `real` | rw |
| `lightness uniformity` | `real` | rw |

### `tools configuration`

| property | type | access |
| --- | --- | --- |
| `visible` | `boolean` | rw |
| `size` | `integer` | rw |
| `auto hide` | `boolean` | rw |
| `placement` | `tool placement` | rw |

### `viewer configuration`
- contains: `tool tab`, `toolbar item`

| property | type | access |
| --- | --- | --- |
| `viewer window` | `window` | rw |
| `tool settings` | `tools configuration` | rw |
| `visible` | `boolean` | rw |
| `zoom` | `integer` | rw |
| `multi view` | `boolean` | rw |
| `proof margin` | `boolean` | rw |
| `labels` | `boolean` | rw |
| `window toolbar mode` | `toolbarDisplayMode` | rw |
| `window toolbar` | `boolean` | rw |
| `viewer toolbar` | `boolean` | rw |

### `browser configuration`

| property | type | access |
| --- | --- | --- |
| `visible` | `boolean` | rw |
| `size` | `integer` | rw |
| `auto hide` | `boolean` | rw |
| `placement` | `browser placement` | rw |
| `toolbar` | `boolean` | rw |
| `mode` | `browser mode` | rw |
| `thumbnail zoom` | `integer` | rw |
| `label mode` | `browser label` | rw |

### `import options`

| property | type | access |
| --- | --- | --- |
| `include subfolders` | `boolean` | rw |
| `exclude duplicates` | `boolean` | rw |
| `destination type` | `import destination type` | rw |
| `destination folder` | `text | file` | rw |
| `destination sub folder` | `text` | rw |
| `destination collection` | `import destination collection` | rw |
| `backup` | `boolean` | rw |
| `backup folder` | `text | file` | rw |
| `import naming format` | `text` | rw |
| `import job name` | `text` | rw |
| `import counter` | `integer` | rw |
| `import counter increment` | `integer` | rw |
| `import copyright` | `text` | rw |
| `import description` | `text` | rw |
| `apply styles` | `text[]` | rw |
| `auto adjust` | `boolean` | rw |
| `include existing adjustments` | `boolean` | rw |
| `import collection action` | `import collection action` | rw |
| `eject card` | `boolean` | rw |
| `erase after copy` | `boolean` | rw |

### `export original options`

| property | type | access |
| --- | --- | --- |
| `destination folder` | `text | file` | rw |
| `sub folder` | `text` | rw |
| `naming method` | `naming method` | rw |
| `naming format` | `text` | rw |
| `job name` | `text` | rw |
| `export counter` | `integer` | rw |
| `export counter increment` | `integer` | rw |
| `find text` | `text` | rw |
| `replacement text` | `text` | rw |
| `packed` | `boolean` | rw |
| `include adjustments` | `boolean` | rw |
| `include movies` | `boolean` | rw |
| `notify` | `boolean` | rw |

### `output event`

| property | type | access |
| --- | --- | --- |
| `id` | `text` | read-only |
| `date` | `date` | read-only |
| `file` | `file` | read-only |
| `path` | `text` | read-only |
| `exists` | `boolean` | read-only |

### `image`
- contains: `variant`

| property | type | access |
| --- | --- | --- |
| `path` | `text` | read-only |
| `extension` | `text` | read-only |
| `file` | `file` | read-only |
| `file size` | `integer` | read-only |
| `name` | `text` | rw |
| `source filename` | `text` | rw |
| `id` | `text` | read-only |
| `dimensions` | `point` | read-only |
| `preliminary` | `boolean` | read-only |
| `packed` | `boolean` | read-only |
| `EXIF capture date` | `date` | rw |
| `EXIF camera make` | `text` | read-only |
| `EXIF camera model` | `text` | read-only |
| `EXIF camera software` | `text` | read-only |
| `EXIF camera owner` | `text` | read-only |
| `EXIF ISO` | `text` | read-only |
| `EXIF shutter speed` | `text` | read-only |
| `EXIF aperture` | `text` | read-only |
| `EXIF exposure compensation` | `text` | read-only |
| `EXIF flash mode` | `text` | read-only |
| `EXIF exposure program` | `text` | read-only |
| `EXIF metering mode` | `text` | read-only |
| `EXIF focal length` | `text` | read-only |
| `EXIF white balance` | `text` | read-only |
| `EXIF latitude` | `text` | read-only |
| `EXIF longitude` | `text` | read-only |
| `EXIF altitude` | `text` | read-only |

### `batch rename options`

| property | type | access |
| --- | --- | --- |
| `method` | `naming method` | rw |
| `token format` | `text` | rw |
| `job name` | `text` | rw |
| `counter` | `integer` | rw |
| `counter increment` | `integer` | rw |
| `find text` | `text` | rw |
| `replacement text` | `text` | rw |
| `include file extension` | `boolean` | rw |
| `pair RAWs and JPGs` | `boolean` | rw |

### `next capture options`
- contains: `keyword`

| property | type | access |
| --- | --- | --- |
| `capture profile` | `text` | rw |
| `capture orientation` | `integer` | rw |
| `capture metadata` | `adjustments source` | rw |
| `other adjustments` | `adjustments source` | rw |
| `apply styles` | `text[]` | rw |
| `auto alignment` | `boolean` | rw |
| `contact creator` | `text` | rw |
| `contact creator job title` | `text` | rw |
| `contact address` | `text` | rw |
| `contact city` | `text` | rw |
| `contact state` | `text` | rw |
| `contact postal code` | `text` | rw |
| `contact country` | `text` | rw |
| `contact phone` | `text` | rw |
| `contact email` | `text` | rw |
| `contact website` | `text` | rw |
| `content headline` | `text` | rw |
| `content description` | `text` | rw |
| `content category` | `text` | rw |
| `content supplemental categories` | `text` | rw |
| `content subject codes` | `text` | rw |
| `content description writer` | `text` | rw |
| `image intellectual genre` | `text` | rw |
| `image scenes` | `text` | rw |
| `image location` | `text` | rw |
| `image city` | `text` | rw |
| `image state` | `text` | rw |
| `image country` | `text` | rw |
| `image country code` | `text` | rw |
| `status title` | `text` | rw |
| `status job identifier` | `text` | rw |
| `status instructions` | `text` | rw |
| `status provider` | `text` | rw |
| `status source` | `text` | rw |
| `status copyright notice` | `text` | rw |
| `status rights usage terms` | `text` | rw |
| `Getty personalities` | `text` | rw |
| `Getty original filename` | `text` | rw |
| `Getty parent MEID` | `text` | rw |
| `backup` | `boolean` | rw |
| `backup queue enabled` | `boolean` | rw |
| `backup destination` | `text | file` | rw |

### `server options`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | rw |
| `served collection` | `collection` | rw |
| `password` | `text` | write-only |
| `address` | `text` | read-only |
| `mobile serving` | `boolean` | rw |
| `mobile port` | `integer` | rw |
| `mobile rate` | `boolean` | rw |
| `mobile color tag` | `boolean` | rw |
| `mobile adjust` | `boolean` | rw |
| `mobile capture` | `boolean` | rw |
| `web serving` | `boolean` | rw |
| `web port` | `integer` | rw |
| `web theme` | `text` | rw |
| `web rate` | `boolean` | rw |
| `web color tag` | `boolean` | rw |

### `overlay options`

| property | type | access |
| --- | --- | --- |
| `visible` | `boolean` | rw |
| `follow crop` | `boolean` | rw |
| `image path` | `text` | rw |
| `opacity` | `integer` | rw |
| `scale` | `integer` | rw |
| `horizontal position` | `real` | rw |
| `vertical position` | `real` | rw |

### `client viewer`

| property | type | access |
| --- | --- | --- |
| `name` | `text` | read-only |
| `mode` | `client viewer mode` | rw |

### `grid options`

| property | type | access |
| --- | --- | --- |
| `visible` | `boolean` | rw |
| `follow crop` | `boolean` | rw |
| `color` | `integer` | rw |
| `kind` | `grid type` | rw |
| `long edge` | `integer` | rw |
| `short edge` | `integer` | rw |
| `clockwise` | `boolean` | rw |
| `mirror` | `boolean` | rw |

### `guide options`
- contains: `guide`

| property | type | access |
| --- | --- | --- |
| `visible` | `boolean` | rw |
| `follow crop` | `boolean` | rw |
| `color` | `integer` | rw |

### `guide`

| property | type | access |
| --- | --- | --- |
| `distance` | `real` | rw |
| `units` | `measurementUnit` | rw |
| `edge` | `edge type` | rw |

## Enumerations

- **adjustments source**: `default`, `copy from last`, `copy from primary`, `copy from clipboard`, `copy specific from last`, `copy specific from primary`, `copy variants from last`, `copy variants from primary`, `document values`
- **assisted review exposure**: `no issues detected`, `bad exposure`
- **assisted review eyes focus**: `no issues detected`, `likely out of focus`, `out of focus`, `cannot tell`
- **assisted review eyes state**: `no issues detected`, `likely closed eyes`, `closed eyes`, `cannot tell`
- **attributeUserLevel**: `basic`, `advanced`, `developer`
- **auto select mode**: `disabled`, `immediately`, `when preview ready`, `when ready`
- **browser label**: `off`, `edit`, `status`
- **browser mode**: `grid`, `list`, `filmstrip`
- **browser placement**: `left`, `right`, `bottom`
- **clarity method**: `natural`, `punch`, `neutral`, `classic`
- **client viewer mode**: `pin`, `selection`, `last capture`, `inactive`
- **collectionType**: `favorite`, `catalog folder`, `album`, `group`, `project`, `smart album`
- **compareModes**: `display before`, `display split`
- **crop aspect ratio orientation**: `landscape`, `portrait`, `square`
- **curve color system**: `Capture One`, `DNG`, `Fujifilm`, `From File`, `Other`
- **distance type**: `percent of diagonal`, `inches`, `centimeters`
- **documentType**: `session`, `catalog`
- **edge type**: `top`, `left`, `right`, `bottom`
- **existing files behavior**: `add suffix`, `overwrite`, `skip`
- **export crop method**: `respect`, `ignore`, `crop to path`
- **flip type**: `none`, `horizontal`, `vertical`
- **focus indication**: `no indicator`, `focused`, `unfocused`, `too near`, `too far`, `front focus`, `behind focus`, `driving`, `tracking`, `unknown`
- **grain type**: `fine`, `silver rich`, `soft`, `cubic`, `tabular`, `harsh`
- **grid type**: `rectangular`, `golden ratio`, `fibonacci spiral`
- **import collection action**: `no action`, `notify when done`, `open collection`
- **import destination collection**: `recent`, `capture collection`, `selected album`
- **import destination type**: `capture folder`, `session folder`, `selected folder`, `current location`, `inside catalog`, `custom`
- **layer type**: `adjustment`, `clone`, `heal`, `filled`, `subject mask`, `background mask`, `background`
- **liveViewStatus**: `closed`, `running`, `paused`
- **measurementUnit**: `pixels`, `inches`, `millimeters`, `centimeters`, `percent`
- **naming method**: `text and tokens`, `find and replace`
- **nextcaptureadjustments**: `Default`, `Last`, `Primary`, `Using Clipboard`, `Last With Variants`, `Primary With Variants`
- **openCLStatus**: `never`, `auto`
- **people mask area**: `body skin`, `face skin`, `eyebrows`, `lips`, `hair`, `iris and pupil`, `sclera`, `clothes`
- **recipeFileFormat**: `JPEG`, `JPEG_QuickProof`, `JPEG_XR`, `JPEG_2000`, `TIFF`, `DNG`, `PNG`, `PSD`, `PSB`, `Affinity`, `Original`
- **recipeRootType**: `output location`, `image folder`, `custom location`
- **scalingType**: `Fixed`, `Width_Scaling`, `Height_Scaling`, `BoundingDimensions`, `Width_by_Height`, `Long_Edge`, `Short_Edge`
- **select type**: `next collection`, `previous collection`, `next set`, `previous set`, `next variant`, `previous variant`
- **sharpening type**: `no output sharpening`, `for screen`, `for print`, `disable all`
- **shutterlatency**: `Normal Latency`, `Zero Latency`, `Unknown Latency`
- **sort order**: `by name`, `by date`, `by rating`, `by color tag`, `by camera lens`, `by ISO`, `by focal length`, `by width`, `by height`, `by file size`, `by processed state`, `by aperture`, `by shutter speed`, `by extension`, `by sequence ID`, `by manual`
- **technical processing mode**: `photography`, `film negative`, `repro negative`, `repro positive`
- **tiffCompress**: `Uncompressed`, `LZW`, `ZIP`
- **tool placement**: `left`, `right`
- **toolbarDisplayMode**: `off`, `icon and text`, `icon only`
- **vignette method**: `elliptic on crop`, `circular on crop`, `circular`
- **watermarkKind**: `Textual`, `Imagery`, `None`
