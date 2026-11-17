/** The current time, in one place, so server components that compare
 * against "now" (sun position, solunar "now" marker) read it outside
 * render logic and tests can see where it comes from. */
export function currentTime(): Date {
  return new Date()
}
