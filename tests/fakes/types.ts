export interface Fake {
	url: string;
	stop(): Promise<void>;
	reset(): void;
}
