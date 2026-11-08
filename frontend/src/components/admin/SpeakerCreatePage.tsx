import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import SpeakerForm from './SpeakerForm';

/** `/admin/speakers/new`: create a profile on behalf of someone without an account. */
const SpeakerCreatePage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <section>
      <p>
        <Link to="/admin/speakers">Back to speakers</Link>
      </p>
      <h1>New speaker</h1>
      <p>Create a profile for a person without an account. You can link it to an account and upload a headshot after creating it.</p>
      <SpeakerForm
        onSubmit={(input) => api.createSpeaker(input)}
        onSaved={(s) => navigate(`/admin/speakers/${encodeURIComponent(s.speakerId)}`)}
        onCancel={() => navigate('/admin/speakers')}
      />
    </section>
  );
};

export default SpeakerCreatePage;
