# Page Components

Files in this folder are route-level screens. They are allowed to coordinate data loading, form state, navigation, and page layout.

Avoid adding new calculations or cross-page business rules directly to these files. Move shared exposure, media, film, or gear behavior into the domain helpers under `src/`, and move reusable controls into `src/components/`.

`photoExposurePageUtils.ts` exists for create/edit photo form glue that still belongs near the route code but should not be duplicated between pages.
