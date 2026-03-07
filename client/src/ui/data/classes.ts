/**
 * Stub for CLASSES_DATA — SlimeArena class selection removed.
 * Single "blob" entry to satisfy legacy UI components (MainMenu, ResultsScreen).
 * Will be replaced with vehicle/skin selector in BonkRace.
 */
export interface ClassData {
    id: number;
    name: string;
    icon: string;
    description: string;
    cssClass: string;
}

export const CLASSES_DATA: ClassData[] = [
    { id: 0, name: "Blob", icon: "🟢", description: "Default racer", cssClass: "class-blob" },
];
