-- A user of web3.storage.
CREATE TABLE IF NOT EXISTS public.user
(
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT                                                          NOT NULL,
  picture         TEXT,
  email           TEXT                                                          NOT NULL,
  -- The Decentralized ID of the Magic User who generated the DID Token.
  issuer          TEXT                                                          NOT NULL UNIQUE,
  -- GitHub user handle, may be null if user logged in via email.
  github          TEXT,
  -- Cryptographic public address of the Magic User.
  public_address  TEXT                                                          NOT NULL UNIQUE,
  inserted_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS user_updated_at_idx ON public.user (updated_at);

-- User authentication keys.
CREATE TABLE IF NOT EXISTS auth_key
(
  id              BIGSERIAL PRIMARY KEY,
  -- User assigned name.
  name            TEXT                                                          NOT NULL,
  -- Secret that corresponds to this token.
  secret          TEXT                                                          NOT NULL,
  -- User this token belongs to.
  user_id         BIGINT                                                        NOT NULL REFERENCES public.user (id),
  inserted_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  deleted_at      TIMESTAMP WITH TIME ZONE
);

-- Details of the root of a file/directory stored on web3.storage.
CREATE TABLE IF NOT EXISTS content
(
  -- Root CID for this content. Normalized as v1 base32.
  cid             TEXT PRIMARY KEY,
  -- Size of the DAG in bytes. Either the cumulativeSize for dag-pb or the sum of block sizes in the CAR.
  dag_size        BIGINT,
  inserted_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS content_updated_at_idx ON content (updated_at);

-- IPFS Cluster tracker status values.
-- https://github.com/ipfs/ipfs-cluster/blob/54c3608899754412861e69ee81ca8f676f7e294b/api/types.go#L52-L83
-- TODO: nft.storage only using a subset of these: https://github.com/ipfs-shipyard/nft.storage/blob/main/packages/api/db/tables.sql#L2-L7
CREATE TYPE pin_status_type AS ENUM
(
  -- Should never see this value. When used as a filter. It means "all".
  'Undefined',
  -- The cluster node is offline or not responding.
  'ClusterError',
  -- An error occurred pinning.
  'PinError',
  -- An error occurred unpinning.
  'UnpinError',
  -- The IPFS daemon has pinned the item.
  'Pinned',
  -- The IPFS daemon is currently pinning the item.
  'Pinning',
  -- The IPFS daemon is currently unpinning the item.
  'Unpinning',
  -- The IPFS daemon is not pinning the item.
  'Unpinned',
  -- The IPFS daemon is not pinning the item but it is being tracked.
  'Remote',
  -- The item has been queued for pinning on the IPFS daemon.
  'PinQueued',
  -- The item has been queued for unpinning on the IPFS daemon.
  'UnpinQueued',
  -- The IPFS daemon is not pinning the item through this CID but it is tracked
  -- in a cluster dag
  'Sharded'
);

-- An IPFS node that is pinning content.
CREATE TABLE IF NOT EXISTS pin_location
(
  id              BIGSERIAL PRIMARY KEY,
  -- Libp2p peer ID of the node pinning this pin.
  peer_id         TEXT                                                          NOT NULL UNIQUE,
  -- Name of the peer pinning this pin.
  peer_name       TEXT,
  -- Geographic region this node resides in.
  region          TEXT
);

-- Information for piece of content pinned in IPFS.
CREATE TABLE IF NOT EXISTS pin
(
  id              BIGSERIAL PRIMARY KEY,
  -- Pinning status at this location.
  status          pin_status_type                                               NOT NULL,
  -- The content being pinned.
  content_cid     TEXT                                                          NOT NULL REFERENCES content (cid),
  -- Identifier for the service that is pinning this pin.
  pin_location_id BIGINT                                                        NOT NULL REFERENCES pin_location (id),
  inserted_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (content_cid, pin_location_id)
);

CREATE INDEX IF NOT EXISTS pin_updated_at_idx ON pin (updated_at);

-- Upload type is the type of received upload data.
CREATE TYPE upload_type AS ENUM
(
  -- A CAR file upload.
  'Car',
  -- Files uploaded and converted into a CAR file.
  'Upload',
  -- A raw blob upload in the request body.
  'Blob',
  -- A multi file upload using a multipart request.
  'Multipart'
);

-- An upload created by a user.
CREATE TABLE IF NOT EXISTS upload
(
  id              BIGSERIAL PRIMARY KEY,
  -- User that uploaded this content.
  user_id         BIGINT                                                        NOT NULL REFERENCES public.user (id),
  -- User authentication token that was used to upload this content.
  -- Note: nullable, because the user may have used a Magic.link token.
  auth_key_id     BIGINT REFERENCES auth_key (id),
  -- The root of the uploaded content (base32 CIDv1 normalised).
  content_cid     TEXT                                                          NOT NULL REFERENCES content (cid),
  -- CID in the from we found in the received file.
  source_cid      TEXT                                                          NOT NULL,
  -- Type of received upload data.
  type            upload_type                                                   NOT NULL,
  -- User provided name for this upload.
  name            TEXT,
  inserted_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  deleted_at      TIMESTAMP WITH TIME ZONE,
  -- deleted_at      TIMESTAMP WITH TIME ZONE, do we want?
  UNIQUE (user_id, source_cid)
);

CREATE INDEX IF NOT EXISTS upload_updated_at_idx ON upload (updated_at);

-- Details of the backups created for an upload.
CREATE TABLE IF NOT EXISTS backup
(
  id              BIGSERIAL PRIMARY KEY,
  -- Upload that resulted in this backup.
  upload_id       BIGINT                                                        NOT NULL REFERENCES upload (id) ON DELETE CASCADE,
  -- Backup url location.
  url             TEXT                                                          NOT NULL UNIQUE,
  inserted_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- A request to keep a Pin in sync with the nodes that are pinning it.
CREATE TABLE IF NOT EXISTS pin_request
(
  id              BIGSERIAL PRIMARY KEY,
  -- Identifier for the pin to keep in sync.
  pin_id          BIGINT                                                        NOT NULL REFERENCES pin (id),
  inserted_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
)
