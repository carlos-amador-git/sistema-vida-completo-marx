// src/components/maps/EmergencyMap.tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons — colors match VIDA palette CSS variables
// --danger: hsl(0 84% 60%) → #f45050 approx; --vida-600: hsl(210 87% 40%) → #0d6ecd approx
const userIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
      <circle cx="12" cy="12" r="10" fill="#f45050"/>
      <circle cx="12" cy="12" r="6" fill="white"/>
      <circle cx="12" cy="12" r="3" fill="#f45050"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// Hospital icon - standard (--vida-600 hsl(210 87% 40%) → #0d6ecd approx)
const hospitalIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#0d6ecd" width="28" height="28">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/>
    </svg>
  `),
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

// Hospital icon - recommended (--success hsl(142 71% 45%) → #22a85a approx)
const hospitalRecommendedIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="36" height="36">
      <circle cx="16" cy="16" r="14" fill="#22a85a" stroke="#fff" stroke-width="2"/>
      <path d="M23 13h-4v-4h-6v4H9v6h4v4h6v-4h4v-6z" fill="white"/>
    </svg>
  `),
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

export interface Hospital {
  id: string;
  name: string;
  type: string;
  address?: string;
  phone?: string;
  emergencyPhone?: string;
  latitude: number;
  longitude: number;
  distance?: number;
  attentionLevel?: 'FIRST' | 'SECOND' | 'THIRD';
  specialties?: string[];
  hasEmergency?: boolean;
  has24Hours?: boolean;
  hasICU?: boolean;
  hasTrauma?: boolean;
  matchScore?: number;
  matchedSpecialties?: string[];
}

interface EmergencyMapProps {
  userLocation?: { lat: number; lng: number };
  hospitals?: Hospital[];
  showRadius?: boolean;
  radiusKm?: number;
  height?: string;
  onHospitalSelect?: (hospital: Hospital) => void;
  showMatchScore?: boolean;
}

// Component to recenter map when location changes
function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function EmergencyMap({
  userLocation,
  hospitals = [],
  showRadius = true,
  radiusKm = 10,
  height = '400px',
  onHospitalSelect,
  showMatchScore = false,
}: EmergencyMapProps) {
  const { t } = useTranslation('emergency');
  const [mapCenter, setMapCenter] = useState<[number, number]>([19.4326, -99.1332]); // CDMX default

  useEffect(() => {
    if (userLocation) {
      setMapCenter([userLocation.lat, userLocation.lng]);
    }
  }, [userLocation]);

  const getHospitalTypeLabel = (type: string) => {
    const key = `map.hospitalTypes.${type}`;
    const translated = t(key);
    return translated !== key ? translated : type;
  };

  const attentionLevelColors: Record<string, string> = {
    FIRST: 'bg-blue-100 text-blue-700',
    SECOND: 'bg-purple-100 text-purple-700',
    THIRD: 'bg-amber-100 text-amber-700',
  };

  const getAttentionLevelLabel = (level?: string) => {
    if (!level || !attentionLevelColors[level]) return null;
    return {
      label: t(`map.attentionLevels.${level}`),
      color: attentionLevelColors[level],
    };
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 70) return 'bg-green-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  const getHospitalIcon = (hospital: Hospital) => {
    // Use green icon for recommended hospitals (high match score)
    if (showMatchScore && hospital.matchScore && hospital.matchScore >= 60) {
      return hospitalRecommendedIcon;
    }
    return hospitalIcon;
  };

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height }}>
      <MapContainer
        center={mapCenter}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* User location */}
        {userLocation && (
          <>
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
              <Popup>
                <div className="text-center">
                  <strong className="text-red-600">{t('map.yourLocation')}</strong>
                  <br />
                  <span className="text-sm text-gray-500">
                    {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
                  </span>
                </div>
              </Popup>
            </Marker>

            {showRadius && (
              <Circle
                center={[userLocation.lat, userLocation.lng]}
                radius={radiusKm * 1000}
                pathOptions={{
                  color: '#f45050',
                  fillColor: '#f45050',
                  fillOpacity: 0.08,
                  weight: 2,
                  dashArray: '5, 5',
                }}
              />
            )}

            <RecenterMap center={[userLocation.lat, userLocation.lng]} />
          </>
        )}

        {/* Hospitals */}
        {hospitals.map((hospital) => (
          <Marker
            key={hospital.id}
            position={[hospital.latitude, hospital.longitude]}
            icon={getHospitalIcon(hospital)}
            eventHandlers={{
              click: () => onHospitalSelect?.(hospital),
            }}
          >
            <Popup>
              <div className="min-w-[220px] max-w-[280px]">
                {/* Header with match score */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-sky-700 leading-tight">{hospital.name}</h3>
                  {showMatchScore && hospital.matchScore !== undefined && (
                    <div className="flex-shrink-0">
                      <div className={`${getMatchScoreColor(hospital.matchScore)} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>
                        {hospital.matchScore}%
                      </div>
                    </div>
                  )}
                </div>

                {/* Type and level badges */}
                <div className="flex flex-wrap gap-1 mb-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {getHospitalTypeLabel(hospital.type)}
                  </span>
                  {hospital.attentionLevel && getAttentionLevelLabel(hospital.attentionLevel) && (
                    <span className={`text-xs px-2 py-0.5 rounded ${getAttentionLevelLabel(hospital.attentionLevel)?.color}`}>
                      {getAttentionLevelLabel(hospital.attentionLevel)?.label}
                    </span>
                  )}
                </div>

                {/* Capabilities */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {hospital.has24Hours && (
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">24h</span>
                  )}
                  {hospital.hasEmergency && (
                    <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{t('map.capabilities.emergency')}</span>
                  )}
                  {hospital.hasICU && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{t('map.capabilities.icu')}</span>
                  )}
                  {hospital.hasTrauma && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">{t('map.capabilities.trauma')}</span>
                  )}
                </div>

                {/* Matched specialties */}
                {showMatchScore && hospital.matchedSpecialties && hospital.matchedSpecialties.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-1">{t('map.relevantSpecialties')}</p>
                    <div className="flex flex-wrap gap-1">
                      {hospital.matchedSpecialties.slice(0, 3).map((spec, i) => (
                        <span key={i} className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">
                          {spec}
                        </span>
                      ))}
                      {hospital.matchedSpecialties.length > 3 && (
                        <span className="text-xs text-gray-500">+{hospital.matchedSpecialties.length - 3}</span>
                      )}
                    </div>
                  </div>
                )}

                {hospital.address && (
                  <p className="text-sm text-gray-600 mb-2">{hospital.address}</p>
                )}

                {/* Distance */}
                {hospital.distance !== undefined && (
                  <p className="text-sm font-medium text-red-600 mb-2">
                    {t('map.distanceAway', { distance: hospital.distance.toFixed(1) })}
                  </p>
                )}

                {/* Call button */}
                {(hospital.emergencyPhone || hospital.phone) && (
                  <a
                    href={`tel:${hospital.emergencyPhone || hospital.phone}`}
                    className="inline-flex items-center gap-1 text-sm text-white bg-red-600 px-3 py-1.5 rounded-full hover:bg-red-700 transition w-full justify-center"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {t('map.callEmergency')}
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
