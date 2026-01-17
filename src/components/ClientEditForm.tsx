import { useState, useEffect } from 'react';

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  notes: string | null;
  tags: string[];
}

interface Props {
  clientId: string;
}

export default function ClientEditForm({ clientId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    role: '',
    notes: '',
    tags: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  async function fetchClient() {
    try {
      const res = await fetch(`/api/clients/${clientId}`, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 404) throw new Error('Client not found');
        throw new Error('Failed to load client');
      }
      const json = await res.json();
      const client: Client = json.data;

      setFormData({
        name: client.name,
        company: client.company || '',
        email: client.email || '',
        phone: client.phone || '',
        role: client.role || '',
        notes: client.notes || '',
        tags: client.tags.join(', ')
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const tags = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name.trim(),
          company: formData.company.trim() || null,
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
          role: formData.role.trim() || null,
          notes: formData.notes.trim() || null,
          tags
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      window.location.href = `/clients/${clientId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }

      window.location.href = '/clients';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="spinner-lg" />
      </div>
    );
  }

  if (error && !formData.name) {
    return (
      <div className="card p-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <a href="/clients" className="btn-primary">Back to Clients</a>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        )}

        <div className="card p-6 space-y-6">
          <h2 className="font-semibold text-gray-900 border-b border-gray-200 pb-4">
            Basic Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="label">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={errors.name ? 'input-error' : 'input'}
                disabled={saving}
              />
              {errors.name && <p className="error-text">{errors.name}</p>}
            </div>

            <div>
              <label htmlFor="company" className="label">Company</label>
              <input
                type="text"
                id="company"
                name="company"
                value={formData.company}
                onChange={handleChange}
                className="input"
                disabled={saving}
              />
            </div>

            <div>
              <label htmlFor="role" className="label">Role / Title</label>
              <input
                type="text"
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="input"
                disabled={saving}
              />
            </div>

            <div>
              <label htmlFor="email" className="label">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={errors.email ? 'input-error' : 'input'}
                disabled={saving}
              />
              {errors.email && <p className="error-text">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="phone" className="label">Phone</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="input"
                disabled={saving}
              />
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-6">
          <h2 className="font-semibold text-gray-900 border-b border-gray-200 pb-4">
            Additional Details
          </h2>

          <div>
            <label htmlFor="tags" className="label">Tags</label>
            <input
              type="text"
              id="tags"
              name="tags"
              value={formData.tags}
              onChange={handleChange}
              placeholder="Comma-separated tags"
              className="input"
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="notes" className="label">Notes</label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              className="input"
              disabled={saving}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-ghost text-red-600 hover:bg-red-50"
          >
            Delete Client
          </button>
          <div className="flex gap-3">
            <a href={`/clients/${clientId}`} className="btn-secondary">Cancel</a>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? (
                <>
                  <span className="spinner-sm" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="card p-6 max-w-sm w-full animate-fade-in">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Client?</h3>
            <p className="text-gray-600 mb-6">
              This will permanently delete this client and all their notes.
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="btn-danger"
                disabled={deleting}
              >
                {deleting ? <span className="spinner-sm" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
