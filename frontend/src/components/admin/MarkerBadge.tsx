import React from 'react';
import type { SpeakerMarker } from '../../services/apiTypes';

const MARKER_LABELS: Record<SpeakerMarker, string> = {
  have_back: 'Have back',
  not_again: 'Not again',
};

/** Text badge so the marker never relies on colour alone. */
const MarkerBadge: React.FC<{ marker?: SpeakerMarker }> = ({ marker }) =>
  marker ? (
    <span className={`badge badge-marker badge-${marker}`} title={MARKER_LABELS[marker]}>
      {MARKER_LABELS[marker]}
    </span>
  ) : null;

export default MarkerBadge;
