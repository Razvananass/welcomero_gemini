import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useI18n } from '../context/useI18n';
import { getInstitutionCoords, getInstitutionVisual, TIMISOARA_CENTER, type Coordinates, type InstitutionVisual } from '../lib/institutions';
import type { Institution } from '../types';
import { Icon, ICON_PATHS, type IconName } from './Icon';
import { cardClass, linkClass, Notice } from './ui';

function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function createSvgElement(iconName: IconName, sizePx: number): SVGSVGElement {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.width = `${sizePx}px`;
  svg.style.height = `${sizePx}px`;
  svg.style.flexShrink = '0';

  const path = document.createElementNS(svgNs, 'path');
  path.setAttribute('d', ICON_PATHS[iconName]);
  svg.appendChild(path);
  return svg;
}

function createPinElement(
  visual: InstitutionVisual,
  label: string,
  isSelected: boolean,
  isHovered: boolean,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.width = 'max-content';
  wrapper.style.transform = `translate(-50%, -100%) scale(${isSelected ? 1.1 : isHovered ? 1.05 : 1})`;
  wrapper.style.transition = 'transform 150ms ease';
  wrapper.style.cursor = 'pointer';

  const pill = document.createElement('div');
  pill.style.display = 'flex';
  pill.style.alignItems = 'center';
  pill.style.gap = '6px';
  pill.style.padding = '5px 10px';
  pill.style.borderRadius = '9999px';
  pill.style.border = '2px solid #ffffff';
  pill.style.backgroundColor = visual.pinBg;
  pill.style.color = '#ffffff';
  pill.style.boxShadow = isSelected
    ? '0 0 0 4px rgba(191, 219, 254, 0.95), 0 4px 10px rgba(15, 23, 42, 0.25)'
    : '0 3px 8px rgba(15, 23, 42, 0.25)';

  pill.appendChild(createSvgElement(visual.icon, 15));

  const text = document.createElement('span');
  text.textContent = label;
  text.style.maxWidth = '128px';
  text.style.overflow = 'hidden';
  text.style.textOverflow = 'ellipsis';
  text.style.whiteSpace = 'nowrap';
  text.style.fontSize = '12px';
  text.style.fontWeight = '700';
  text.style.lineHeight = '1';
  pill.appendChild(text);

  const tip = document.createElement('div');
  tip.style.width = '10px';
  tip.style.height = '10px';
  tip.style.marginTop = '-6px';
  tip.style.transform = 'rotate(45deg)';
  tip.style.backgroundColor = visual.pinBg;
  tip.style.borderRight = '2px solid #ffffff';
  tip.style.borderBottom = '2px solid #ffffff';

  wrapper.appendChild(pill);
  wrapper.appendChild(tip);
  return wrapper;
}

function createPopupElement({
  name,
  address,
  visual,
  mapsLabel,
  viewCardLabel,
  dir,
  onJumpToCard,
}: {
  name: string;
  address: string | null;
  visual: InstitutionVisual;
  mapsLabel: string;
  viewCardLabel: string;
  dir: string;
  onJumpToCard: () => void;
}): HTMLElement {
  const root = document.createElement('div');
  root.dir = dir;
  root.style.minWidth = '210px';
  root.style.maxWidth = '265px';
  root.style.fontFamily = 'inherit';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'flex-start';
  header.style.gap = '8px';

  const badge = document.createElement('span');
  badge.style.display = 'inline-flex';
  badge.style.alignItems = 'center';
  badge.style.justifyContent = 'center';
  badge.style.width = '28px';
  badge.style.height = '28px';
  badge.style.marginTop = '2px';
  badge.style.borderRadius = '8px';
  badge.style.backgroundColor = visual.pinBg;
  badge.style.color = '#ffffff';
  badge.style.flexShrink = '0';
  badge.appendChild(createSvgElement(visual.icon, 15));

  const titleWrap = document.createElement('div');
  titleWrap.style.minWidth = '0';

  const titleEl = document.createElement('h3');
  titleEl.textContent = name;
  titleEl.style.margin = '0';
  titleEl.style.fontSize = '13px';
  titleEl.style.fontWeight = '700';
  titleEl.style.lineHeight = '1.35';
  titleEl.style.color = '#0a3350';
  titleWrap.appendChild(titleEl);

  if (address) {
    const addrEl = document.createElement('p');
    addrEl.textContent = address;
    addrEl.style.margin = '3px 0 0';
    addrEl.style.fontSize = '12px';
    addrEl.style.color = '#475569';
    titleWrap.appendChild(addrEl);
  }

  header.appendChild(badge);
  header.appendChild(titleWrap);
  root.appendChild(header);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.flexWrap = 'wrap';
  actions.style.gap = '12px';
  actions.style.marginTop = '10px';
  actions.style.fontSize = '12px';

  if (address) {
    const mapsLink = document.createElement('a');
    mapsLink.href = mapsSearchUrl(address);
    mapsLink.target = '_blank';
    mapsLink.rel = 'noreferrer noopener';
    mapsLink.textContent = mapsLabel;
    mapsLink.style.fontWeight = '600';
    mapsLink.style.color = '#0b5a86';
    mapsLink.style.textDecoration = 'underline';
    actions.appendChild(mapsLink);
  }

  const cardBtn = document.createElement('button');
  cardBtn.type = 'button';
  cardBtn.textContent = viewCardLabel;
  cardBtn.style.background = 'none';
  cardBtn.style.border = 'none';
  cardBtn.style.padding = '0';
  cardBtn.style.cursor = 'pointer';
  cardBtn.style.fontWeight = '600';
  cardBtn.style.color = '#0b5a86';
  cardBtn.style.textDecoration = 'underline';
  cardBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    onJumpToCard();
  });
  actions.appendChild(cardBtn);

  root.appendChild(actions);
  return root;
}

export function InstitutionMinimap({
  institutions,
  selectedId,
  onSelectInstitution,
  onJumpToCard,
}: {
  institutions: Institution[];
  selectedId: string | null;
  onSelectInstitution: (id: string | null) => void;
  onJumpToCard: (id: string) => void;
}) {
  const { t, loc, lang } = useI18n();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const onSelectRef = useRef(onSelectInstitution);
  const onJumpRef = useRef(onJumpToCard);
  onSelectRef.current = onSelectInstitution;
  onJumpRef.current = onJumpToCard;

  const mapInstitutions = useMemo(
    () => institutions.filter((inst) => !inst.placeholder),
    [institutions],
  );

  const mappedInstitutions = useMemo(() => {
    const items = mapInstitutions
      .map((inst) => {
        const coords = getInstitutionCoords(inst.id);
        return inst.address && coords ? { inst, coords } : null;
      })
      .filter((entry): entry is { inst: Institution; coords: Coordinates } => entry !== null);

    // Sort descending by latitude so southern pins render slightly in front of northern pins.
    return items.sort((a, b) => b.coords.lat - a.coords.lat);
  }, [mapInstitutions]);

  const unverifiedInstitutions = useMemo(
    () => mapInstitutions.filter((inst) => !inst.address || !getInstitutionCoords(inst.id)),
    [mapInstitutions],
  );

  function fitAllMarkers() {
    const map = mapInstanceRef.current;
    if (!map || mappedInstitutions.length === 0) return;
    if (mappedInstitutions.length === 1) {
      const { coords } = mappedInstitutions[0];
      map.setView([coords.lat, coords.lng], 15, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(mappedInstitutions.map(({ coords }) => [coords.lat, coords.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [46, 46], animate: true });
  }

  // Initialize Leaflet map once (100% free OpenStreetMap tiles, zero API key required).
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapInstanceRef.current) return;

    const map = L.map(container, {
      center: [TIMISOARA_CENTER.lat, TIMISOARA_CENTER.lng],
      zoom: 14,
      scrollWheelZoom: false,
    });

    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });

    tiles.on('tileerror', () => {
      setTileError(true);
    });
    tiles.on('tileload', () => {
      setTileError(false);
    });
    tiles.addTo(map);

    map.on('click', () => {
      onSelectRef.current(null);
    });

    mapInstanceRef.current = map;

    if (mappedInstitutions.length > 0) {
      const bounds = L.latLngBounds(mappedInstitutions.map(({ coords }) => [coords.lat, coords.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [46, 46] });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current = {};
    };
    // Initialize map once on mount; bounds and markers synchronize below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create/update institution markers when data, language, selection, or hover changes.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const nextIds = new Set(mappedInstitutions.map(({ inst }) => inst.id));

    for (const [id, marker] of Object.entries(markersRef.current)) {
      if (!nextIds.has(id)) {
        marker.remove();
        delete markersRef.current[id];
      }
    }

    mappedInstitutions.forEach(({ inst, coords }, index) => {
      const visual = getInstitutionVisual(inst.id);
      const isSelected = selectedId === inst.id;
      const isHovered = hoveredId === inst.id;
      const icon = L.divIcon({
        html: createPinElement(visual, t(visual.shortKey), isSelected, isHovered),
        className: 'bg-transparent border-0',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        popupAnchor: [0, -38],
      });

      const popupEl = createPopupElement({
        name: loc(inst.name),
        address: inst.address,
        visual,
        mapsLabel: t('inst.maps'),
        viewCardLabel: t('inst.minimap.viewDetails'),
        dir,
        onJumpToCard: () => onJumpRef.current(inst.id),
      });

      let marker = markersRef.current[inst.id];
      if (!marker) {
        marker = L.marker([coords.lat, coords.lng], {
          icon,
          title: loc(inst.name),
          zIndexOffset: isSelected ? 1000 : isHovered ? 900 : index,
        }).addTo(map);

        marker.bindPopup(popupEl, { maxWidth: 280 });
        marker.on('mouseover', () => setHoveredId(inst.id));
        marker.on('mouseout', () => setHoveredId((prev) => (prev === inst.id ? null : prev)));
        marker.on('click', () => {
          onSelectRef.current(inst.id);
        });
        markersRef.current[inst.id] = marker;
      } else {
        marker.setIcon(icon);
        marker.setZIndexOffset(isSelected ? 1000 : isHovered ? 900 : index);
        marker.setPopupContent(popupEl);
      }
    });
  }, [mappedInstitutions, selectedId, hoveredId, t, loc, lang]);

  // Center map and open popup when an institution is selected.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!selectedId) {
      map.closePopup();
      return;
    }

    const marker = markersRef.current[selectedId];
    const coords = getInstitutionCoords(selectedId);
    if (!marker || !coords) return;

    map.setView([coords.lat, coords.lng], Math.max(map.getZoom(), 15), { animate: true });
    marker.openPopup();
  }, [selectedId]);

  return (
    <section aria-labelledby="inst-minimap-title" className={`${cardClass} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="inst-minimap-title" className="flex items-center gap-2 text-lg font-bold text-brand-900">
            <Icon name="mapPin" className="size-5 text-brand-700" />
            {t('inst.minimap.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('inst.minimap.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelectInstitution(null);
            fitAllMarkers();
          }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-brand-700 bg-white px-3 py-1.5 text-sm font-semibold text-brand-800 hover:bg-brand-50"
        >
          <Icon name="locate" className="size-4" />
          {t('inst.minimap.showAll')}
        </button>
      </div>

      {/* Institutional buildings/offices shown on the minimap with icons */}
      <ul className="flex flex-wrap gap-2" aria-label={t('inst.minimap.title')}>
        {mapInstitutions.map((inst) => {
          const visual = getInstitutionVisual(inst.id);
          const hasAddress = Boolean(inst.address && getInstitutionCoords(inst.id));
          const isSelected = selectedId === inst.id;
          return (
            <li key={inst.id}>
              <button
                type="button"
                onClick={() => {
                  if (hasAddress) {
                    onSelectInstitution(inst.id);
                  } else {
                    onSelectInstitution(inst.id);
                    onJumpToCard(inst.id);
                  }
                }}
                onMouseEnter={() => setHoveredId(inst.id)}
                onMouseLeave={() => setHoveredId(null)}
                aria-pressed={isSelected}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-start text-sm font-medium transition-colors ${
                  isSelected
                    ? 'border-brand-700 bg-brand-50 text-brand-900 ring-2 ring-brand-200'
                    : 'border-slate-200 bg-white text-ink hover:border-brand-300 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-md border ${visual.badgeClass}`}
                >
                  <Icon name={visual.icon} className="size-3.5" />
                </span>
                <span>{t(visual.shortKey)}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    hasAddress ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {hasAddress ? t('inst.minimap.pinned') : t('inst.minimap.noAddress')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {tileError ? (
        <Notice tone="warning" role="status">
          {t('inst.minimap.unavailable')}
        </Notice>
      ) : null}

      <div
        ref={mapContainerRef}
        className="relative z-0 h-[340px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 sm:h-[380px]"
      />

      {unverifiedInstitutions.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
          <h3 className="text-xs font-bold text-muted">
            {t('inst.minimap.unverifiedTitle')}
          </h3>
          <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
            {unverifiedInstitutions.map((inst) => {
              const visual = getInstitutionVisual(inst.id);
              const isSelected = selectedId === inst.id;
              return (
                <div
                  key={inst.id}
                  className={`flex items-start gap-3 rounded-lg border bg-white p-3 ${
                    isSelected ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-200'
                  }`}
                >
                  <span
                    className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border ${visual.badgeClass}`}
                  >
                    <Icon name={visual.icon} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-brand-900">{loc(inst.name)}</p>
                    <p className="mt-0.5 text-xs text-muted">{t('inst.notVerified')}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => onJumpToCard(inst.id)}
                        className={linkClass}
                      >
                        {t('inst.minimap.viewDetails')}
                      </button>
                      <a
                        href={inst.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={linkClass}
                        dir="ltr"
                      >
                        {inst.website.replace('https://', '')}
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
