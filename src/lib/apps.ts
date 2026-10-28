export interface AppDef {
  id: string;
  name: string;
  desc: string;
  tag: string;
}

export const APPS: AppDef[] = [
  { id: "calculator", name: "Calculator", desc: "Arithmetic with keyboard input and history", tag: "math" },
  { id: "notes", name: "Notes", desc: "Multi-note scratchpad, saved in your browser", tag: "study" },
  { id: "draw", name: "Draw", desc: "Monochrome sketch canvas — export as PNG", tag: "creative" },
  { id: "markdown", name: "Markdown Editor", desc: "Write markdown, see it formatted live", tag: "study" },
  { id: "code", name: "Code Sandbox", desc: "Run JavaScript and inspect the console", tag: "study" },
  { id: "timers", name: "Timers", desc: "Stopwatch, countdown and pomodoro", tag: "study" },
  { id: "clock", name: "World Clock", desc: "Track multiple time zones at once", tag: "utility" },
  { id: "converter", name: "Unit Converter", desc: "Length, mass, temperature, data and more", tag: "utility" },
  { id: "text", name: "Text Tools", desc: "Counts, case conversion and cleanups", tag: "utility" },
  { id: "random", name: "Random Picker", desc: "Dice, coins, numbers and list draws", tag: "utility" },
];
