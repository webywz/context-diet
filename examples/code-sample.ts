/**
 * Very long banner comment that should be stripped by the code preset
 * because it adds nothing once you already see the function signatures.
 * Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
 * tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim.
 */
export function greet(name: string): string {
  // noisy inline note about history of this helper
  return `Hello, ${name}!`;
}

export async function main(): Promise<void> {
  console.log(greet("world"));
}
