import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const ITEM_SWIPE_MIN_DISTANCE = 48;
const ITEM_SWIPE_MAX_VERTICAL_DRIFT = 64;
const ITEM_SWIPE_AXIS_RATIO = 1.15;
const ITEM_SWIPE_EXIT_MS = 180;
const COLLECTION_SWIPE_ENTRY_DIRECTION_KEY = "phototracker.collectionSwipeEntryDirection";

export type CollectionSwipeDestination = {
  to: string;
  label: string;
};

type SwipeSnapshot = {
  active: boolean;
  startX: number;
  startY: number;
  latestX: number;
  latestY: number;
};

export type CollectionSwipeDirection = "previous" | "next";
export type CollectionSwipeNavigationWidth = "narrow" | "page" | "wide";

function rememberCollectionSwipeEntryDirection(direction: CollectionSwipeDirection) {
  try {
    window.sessionStorage.setItem(COLLECTION_SWIPE_ENTRY_DIRECTION_KEY, direction);
  } catch {
    // Swipe still navigates if session storage is unavailable; only the loaded-page entry hint is lost.
  }
}

export function consumeCollectionSwipeEntryDirection(): CollectionSwipeDirection | null {
  try {
    const value = window.sessionStorage.getItem(COLLECTION_SWIPE_ENTRY_DIRECTION_KEY);
    window.sessionStorage.removeItem(COLLECTION_SWIPE_ENTRY_DIRECTION_KEY);
    return value === "previous" || value === "next" ? value : null;
  } catch {
    return null;
  }
}

function supportsTouchSwipe() {
  if (typeof window === "undefined") return false;
  return navigator.maxTouchPoints > 0 || "ontouchstart" in window;
}

function shouldIgnoreSwipeStart(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;

  return Boolean(target.closest(
    [
      "input",
      "textarea",
      "select",
      "button",
      "[contenteditable='true']",
      "[data-app-swipe-ignore='true']",
    ].join(","),
  ));
}

export function CollectionSwipeNavigator({
  children,
  previous,
  next,
  positionLabel,
  collectionLabel,
  navigationWidth = "page",
}: {
  children: ReactNode;
  previous?: CollectionSwipeDestination | null;
  next?: CollectionSwipeDestination | null;
  positionLabel?: string | null;
  collectionLabel: string;
  navigationWidth?: CollectionSwipeNavigationWidth;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isEntering, setIsEntering] = useState(false);
  const [exitDirection, setExitDirection] = useState<CollectionSwipeDirection | null>(null);
  const navigationTimeoutRef = useRef<number | null>(null);
  const entryFrameRef = useRef<number | null>(null);
  const routeKeyRef = useRef(`${location.pathname}${location.search}`);
  const pendingNavigationDirectionRef = useRef<CollectionSwipeDirection | null>(null);
  const swipeRef = useRef<SwipeSnapshot>({
    active: false,
    startX: 0,
    startY: 0,
    latestX: 0,
    latestY: 0,
  });
  const hasNavigation = Boolean(previous || next);

  useLayoutEffect(() => {
    const nextRouteKey = `${location.pathname}${location.search}`;
    if (routeKeyRef.current === nextRouteKey) return;

    routeKeyRef.current = nextRouteKey;
    const entryDirection = pendingNavigationDirectionRef.current;
    pendingNavigationDirectionRef.current = null;

    if (entryFrameRef.current != null) {
      window.cancelAnimationFrame(entryFrameRef.current);
      entryFrameRef.current = null;
    }

    if (!entryDirection) {
      setDragOffset(0);
      setIsDragging(false);
      setIsEntering(false);
      setExitDirection(null);
      return;
    }

    const width = Math.max(window.innerWidth, 320);
    setIsDragging(false);
    setIsEntering(true);
    setExitDirection(null);
    setDragOffset(entryDirection === "next" ? width : -width);

    entryFrameRef.current = window.requestAnimationFrame(() => {
      entryFrameRef.current = window.requestAnimationFrame(() => {
        setIsEntering(false);
        setDragOffset(0);
        entryFrameRef.current = null;
      });
    });
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (exitDirection || isEntering) return;
    setDragOffset(0);
    setIsDragging(false);
    setExitDirection(null);
    if (navigationTimeoutRef.current != null) {
      window.clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
  }, [exitDirection, isEntering, previous?.to, next?.to, positionLabel]);

  useEffect(() => () => {
    if (navigationTimeoutRef.current != null) {
      window.clearTimeout(navigationTimeoutRef.current);
    }
    if (entryFrameRef.current != null) {
      window.cancelAnimationFrame(entryFrameRef.current);
    }
  }, []);

  const resetSwipe = () => {
    swipeRef.current.active = false;
    setIsDragging(false);
    setDragOffset(0);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!hasNavigation || !supportsTouchSwipe() || event.touches.length !== 1) {
      resetSwipe();
      return;
    }

    if (shouldIgnoreSwipeStart(event.target)) {
      resetSwipe();
      return;
    }

    const touch = event.touches[0];
    if (navigationTimeoutRef.current != null) {
      window.clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    setExitDirection(null);
    setIsDragging(true);
    setDragOffset(0);
    swipeRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      latestX: touch.clientX,
      latestY: touch.clientY,
    };
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const snapshot = swipeRef.current;
    if (!snapshot.active || event.touches.length !== 1) return;

    const touch = event.touches[0];
    snapshot.latestX = touch.clientX;
    snapshot.latestY = touch.clientY;

    const deltaX = snapshot.latestX - snapshot.startX;
    const deltaY = snapshot.latestY - snapshot.startY;
    if (
      Math.abs(deltaY) > ITEM_SWIPE_MAX_VERTICAL_DRIFT
      && Math.abs(deltaY) > Math.abs(deltaX)
    ) {
      resetSwipe();
      return;
    }

    const intendedDirection: CollectionSwipeDirection = deltaX < 0 ? "next" : "previous";
    const hasDestination = intendedDirection === "next" ? Boolean(next) : Boolean(previous);
    const resistedDeltaX = hasDestination ? deltaX : deltaX * 0.22;
    setDragOffset(resistedDeltaX);
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const snapshot = swipeRef.current;
    if (!snapshot.active) return;

    swipeRef.current.active = false;
    setIsDragging(false);
    const deltaX = snapshot.latestX - snapshot.startX;
    const deltaY = snapshot.latestY - snapshot.startY;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    if (
      horizontalDistance < ITEM_SWIPE_MIN_DISTANCE
      || verticalDistance > ITEM_SWIPE_MAX_VERTICAL_DRIFT
      || horizontalDistance < verticalDistance * ITEM_SWIPE_AXIS_RATIO
    ) {
      setDragOffset(0);
      return;
    }

    const direction: CollectionSwipeDirection = deltaX < 0 ? "next" : "previous";
    const destination = direction === "next" ? next : previous;
    const exitOffset = direction === "next"
      ? -Math.max(window.innerWidth, 320)
      : Math.max(window.innerWidth, 320);
    if (!destination) {
      setDragOffset(0);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setExitDirection(direction);
    setDragOffset(exitOffset);
    navigationTimeoutRef.current = window.setTimeout(() => {
      pendingNavigationDirectionRef.current = direction;
      rememberCollectionSwipeEntryDirection(direction);
      navigate(destination.to);
    }, ITEM_SWIPE_EXIT_MS);
  };

  return (
    <div
      className={`collection-swipe collection-swipe--nav-${navigationWidth}`}
      data-has-navigation={hasNavigation ? "true" : undefined}
      data-swipe-dragging={isDragging ? "true" : undefined}
      data-swipe-entering={isEntering ? "true" : undefined}
      data-swipe-exit={exitDirection ?? undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={resetSwipe}
    >
      {hasNavigation && (
        <nav className="collection-swipe-nav" aria-label={`${collectionLabel} navigation`}>
          {previous ? (
            <Link className="collection-swipe-nav-link collection-swipe-nav-link--previous" to={previous.to}>
              <span aria-hidden="true">‹</span>
              <span>{previous.label}</span>
            </Link>
          ) : (
            <span className="collection-swipe-nav-link collection-swipe-nav-link--disabled" aria-hidden="true">
              <span>‹</span>
            </span>
          )}
          {positionLabel && <span className="collection-swipe-position">{positionLabel}</span>}
          {next ? (
            <Link className="collection-swipe-nav-link collection-swipe-nav-link--next" to={next.to}>
              <span>{next.label}</span>
              <span aria-hidden="true">›</span>
            </Link>
          ) : (
            <span className="collection-swipe-nav-link collection-swipe-nav-link--disabled" aria-hidden="true">
              <span>›</span>
            </span>
          )}
        </nav>
      )}

      <div
        className="collection-swipe-content"
        style={{
          "--collection-swipe-offset": `${dragOffset}px`,
        } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
