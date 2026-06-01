export type StaticArtifactUploadAuthStatus = "authenticated" | "anonymous" | "unavailable";

export interface StaticArtifactUploadSessionState {
  readonly status: StaticArtifactUploadAuthStatus;
  readonly identityLabel?: string;
}

export interface StaticArtifactUploadAuthProvider {
  readonly key: "github" | "email";
  readonly available: boolean;
  readonly mode?: "magic-link" | "otp";
}

export interface StaticArtifactUploadLoginRequest {
  readonly provider: StaticArtifactUploadAuthProvider["key"];
  readonly email?: string;
  readonly otp?: string;
  readonly phase: "start" | "verify";
}

export interface StaticArtifactUploadLoginResult extends StaticArtifactUploadSessionState {
  readonly message?: string;
  readonly nextStep?: "otp" | "sent" | "authenticated";
}

export interface StaticArtifactUploadFilePayload {
  readonly file: File;
  readonly path: string;
}

export interface StaticArtifactUploadProgress {
  readonly phase: "reading" | "uploading" | "publishing";
  readonly label: string;
  readonly progress: number;
}

export interface StaticArtifactUploadPublication {
  readonly url: string;
  readonly immutableUrl?: string;
  readonly aliasUrl?: string;
  readonly fileCount: number;
  readonly totalBytes: number;
}

export interface StaticArtifactUploadPublishInput {
  readonly files: readonly StaticArtifactUploadFilePayload[];
  readonly onProgress: (progress: StaticArtifactUploadProgress) => void;
}

export interface StaticArtifactUploadAdapter {
  readonly authProviders?: readonly StaticArtifactUploadAuthProvider[];
  checkSession(): Promise<StaticArtifactUploadSessionState>;
  requestLogin(request: StaticArtifactUploadLoginRequest): Promise<StaticArtifactUploadLoginResult>;
  publish(input: StaticArtifactUploadPublishInput): Promise<StaticArtifactUploadPublication>;
}

export interface StaticArtifactUploadCopy {
  readonly badge: string;
  readonly title: string;
  readonly body: string;
  readonly chooseFiles: string;
  readonly chooseAgain: string;
  readonly selectedSummary: string;
  readonly publish: string;
  readonly publishing: string;
  readonly published: string;
  readonly copyUrl: string;
  readonly copiedUrl: string;
  readonly loginTitle: string;
  readonly loginBody: string;
  readonly githubLogin: string;
  readonly emailLabel: string;
  readonly emailPlaceholder: string;
  readonly emailSend: string;
  readonly emailLinkSent: string;
  readonly otpLabel: string;
  readonly otpPlaceholder: string;
  readonly otpVerify: string;
  readonly close: string;
  readonly authUnavailable: string;
  readonly authenticated: string;
  readonly progressReading: string;
  readonly progressUploading: string;
  readonly progressPublishing: string;
  readonly dropHint: string;
  readonly fileCount: string;
  readonly maxFilesExceeded: string;
  readonly maxTotalBytesExceeded: string;
  readonly sessionChecking: string;
  readonly byteUnit: string;
  readonly kilobyteUnit: string;
  readonly megabyteUnit: string;
  readonly errorGeneric: string;
}

export interface StaticArtifactUploadPanelProps {
  readonly adapter: StaticArtifactUploadAdapter;
  readonly copy: StaticArtifactUploadCopy;
  readonly density?: "default" | "compact" | "minimal";
  readonly maxFiles?: number;
  readonly maxTotalBytes?: number;
}
