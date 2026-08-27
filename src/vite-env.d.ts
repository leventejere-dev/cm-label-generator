/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_EXTRACT_FUNCTION_NAME?: string;
  readonly VITE_MOCK_MODE?: string;
  readonly VITE_PERSISTENCE?: string;
  readonly VITE_SOURCE_IMAGE_BUCKET?: string;
  readonly VITE_RETAIN_SOURCE_IMAGE?: string;
  readonly VITE_IMAGE_MAX_EDGE?: string;
  readonly VITE_IMAGE_TARGET_BYTES?: string;
  readonly VITE_CM_LOGO_URL?: string;
  readonly VITE_CM_COMPANY_LINE?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
