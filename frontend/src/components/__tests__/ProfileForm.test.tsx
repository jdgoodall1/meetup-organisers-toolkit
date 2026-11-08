import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileForm from '../speaker/ProfileForm';

const mockApi = {
  getMyProfile: jest.fn(),
  saveMyProfile: jest.fn(),
  requestHeadshotUpload: jest.fn(),
};
jest.mock('../../services/api', () => ({
  __esModule: true,
  get default() {
    return mockApi;
  },
}));

const audit = { createdAt: '2025-01-01T00:00:00Z', createdBy: 'a', updatedAt: '2025-01-01T00:00:00Z', updatedBy: 'a' };
const ok = <T,>(data: T) => ({ ok: true, status: 200, data });
const empty = { exists: false, name: '', bio: '', location: '', topics: [], links: [], pastTalks: [] };
const existing = {
  ...audit,
  speakerId: 's1',
  name: 'Ada',
  bio: 'Pioneer',
  location: 'London',
  topics: ['math'],
  links: [],
  pastTalks: [],
};

describe('ProfileForm', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  });

  it('shows the welcome prompt when no profile exists', async () => {
    mockApi.getMyProfile.mockResolvedValue(ok(empty));
    render(<ProfileForm />);
    expect(await screen.findByText(/before you can submit to any call for papers/i)).toBeInTheDocument();
    expect(screen.getByText(/save your profile first/i)).toBeInTheDocument();
  });

  it('treats a 404 as no profile', async () => {
    mockApi.getMyProfile.mockResolvedValue({ ok: false, kind: 'error', status: 404, error: { code: 'NOT_FOUND', message: 'x' } });
    render(<ProfileForm />);
    expect(await screen.findByText(/welcome/i)).toBeInTheDocument();
  });

  it('requires name and bio', async () => {
    mockApi.getMyProfile.mockResolvedValue(ok(empty));
    render(<ProfileForm />);
    await userEvent.click(await screen.findByRole('button', { name: 'Create profile' }));
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Bio is required')).toBeInTheDocument();
    expect(mockApi.saveMyProfile).not.toHaveBeenCalled();
  });

  it('creates the profile and shows API field errors', async () => {
    mockApi.getMyProfile.mockResolvedValue(ok(empty));
    mockApi.saveMyProfile
      .mockResolvedValueOnce({ ok: false, kind: 'error', status: 400, error: { code: 'VALIDATION', message: 'bad', fields: { location: 'Too long' } } })
      .mockResolvedValueOnce(ok(existing));
    render(<ProfileForm />);
    await userEvent.type(await screen.findByLabelText(/^Name/), 'Ada');
    await userEvent.type(screen.getByLabelText(/^Bio/), 'Pioneer');
    await userEvent.click(screen.getByRole('button', { name: 'Create profile' }));
    expect(await screen.findByText('Too long')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create profile' }));
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(mockApi.saveMyProfile).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Ada', bio: 'Pioneer' }));
    expect(screen.queryByText(/welcome/i)).not.toBeInTheDocument();
  });

  it('rejects headshots with a bad type or size', async () => {
    mockApi.getMyProfile.mockResolvedValue(ok(existing));
    render(<ProfileForm />);
    const input = await screen.findByLabelText(/upload headshot/i);

    fireEvent.change(input, { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/5 MB or smaller/)).toBeInTheDocument();
    expect(mockApi.requestHeadshotUpload).not.toHaveBeenCalled();
  });

  it('uploads a valid headshot to S3 and saves its key', async () => {
    mockApi.getMyProfile.mockResolvedValue(ok(existing));
    mockApi.requestHeadshotUpload.mockResolvedValue(
      ok({ url: 'https://s3.example/upload', fields: { key: 'headshots/s1/k' }, key: 'headshots/s1/k', expiresInSeconds: 900 }),
    );
    mockApi.saveMyProfile.mockResolvedValue(ok({ ...existing, headshotKey: 'headshots/s1/k' }));
    render(<ProfileForm />);
    const input = await screen.findByLabelText(/upload headshot/i);
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });

    expect(await screen.findByText(/Headshot uploaded/)).toBeInTheDocument();
    expect(mockApi.requestHeadshotUpload).toHaveBeenCalledWith({ contentType: 'image/png', size: 1 });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://s3.example/upload');
    expect(init.method).toBe('POST');

    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(mockApi.saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({ headshotKey: 'headshots/s1/k' })),
    );
  });

  it('reports an S3 upload failure', async () => {
    mockApi.getMyProfile.mockResolvedValue(ok(existing));
    mockApi.requestHeadshotUpload.mockResolvedValue(
      ok({ url: 'https://s3.example/upload', fields: {}, key: 'k', expiresInSeconds: 900 }),
    );
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });
    render(<ProfileForm />);
    const input = await screen.findByLabelText(/upload headshot/i);
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByText(/Headshot upload failed/)).toBeInTheDocument();
  });
});
