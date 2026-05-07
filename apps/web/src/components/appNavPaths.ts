const FILM_SECTION_ROOTS = ["/app/film", "/app/film/stocks", "/app/film/rolls", "/app/film/holders"] as const;

export function isFilmSectionPath(pathname: string): boolean {
  return FILM_SECTION_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}
