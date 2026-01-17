import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface Client {
  id: string;
  name: string;
  company: string | null;
}

interface FormData {
  clientId: string;
  meetingDate: string;
  meetingType: string;
  mood: string;
  summary: string;
  discussed: string;
  decisions: string;
  actionItemsRaw: string;
  concerns: string;
  personalNotes: string;
  nextSteps: string;
}

interface Props {
  initialClientId?: string | null;
  noteId?: string;
  initialData?: Partial<FormData>;
}

export default function NoteForm({ initialClientId, noteId, initialData }: Props) {
  const isEditing = Boolean(noteId);

  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  const [formData, setFormData] = useState<FormData>({
    clientId: initialClientId || initialData?.clientId || '',
    meetingDate: initialData?.meetingDate || new Date().toISOString().split('T')[0],
    meetingType: initialData?.meetingType || 'meeting',
    mood: initialData?.mood || 'neutral',
    summary: initialData?.summary || '',
    discussed: initialData?.discussed || '',
    decisions: initialData?.decisions || '',
    actionItemsRaw: initialData?.actionItemsRaw || '',
    concerns: initialData?.concerns || '',
    personalNotes: initialData?.personalNotes || '',
    nextSteps: initialData?.nextSteps || ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    try {
      const res = await apiFetch('/api/clients');
      if (res.ok) {
        const json = await res.json();
        setClients(json.data);
      }
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoadingClients(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.clientId) {
      newErrors.clientId = 'Please select a client';
    }

    if (!formData.meetingDate) {
      newErrors.meetingDate = 'Meeting date is required';
    }

    if (!formData.summary.trim() && !formData.discussed.trim()) {
      newErrors.summary = 'Please provide a summary or what was discussed';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);
    setGlobalError(null);

    try {
      const payload = {
        clientId: formData.clientId,
        meetingDate: formData.meetingDate,
        meetingType: formData.meetingType,
        mood: formData.mood,
        summary: formData.summary.trim() || null,
        discussed: formData.discussed.trim() || null,
        decisions: formData.decisions.trim() || null,
        actionItemsRaw: formData.actionItemsRaw.trim() || null,
        concerns: formData.concerns.trim() || null,
        personalNotes: formData.personalNotes.trim() || null,
        nextSteps: formData.nextSteps.trim() || null
      };

      const url = isEditing ? `/api/notes/${noteId}` : '/api/notes';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details) {
          const fieldErrors: Partial<Record<keyof FormData, string>> = {};
          data.details.forEach((d: { path: string; message: string }) => {
            const field = d.path as keyof FormData;
            fieldErrors[field] = d.message;
          });
          setErrors(fieldErrors);
        } else {
          throw new Error(data.error || 'Failed to save note');
        }
        return;
      }

      // Success - redirect to client page
      window.location.href = `/clients/${formData.clientId}`;
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const meetingTypes = [
    { value: 'meeting', label: '📅 Meeting' },
    { value: 'call', label: '📞 Call' },
    { value: 'email', label: '📧 Email' },
    { value: 'chat', label: '💬 Chat' },
    { value: 'other', label: '📝 Other' }
  ];

  const moods = [
    { value: 'positive', label: '😊 Positive', color: 'bg-green-100 border-green-300' },
    { value: 'neutral', label: '😐 Neutral', color: 'bg-gray-100 border-gray-300' },
    { value: 'concerned', label: '😟 Concerned', color: 'bg-yellow-100 border-yellow-300' },
    { value: 'frustrated', label: '😤 Frustrated', color: 'bg-red-100 border-red-300' }
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {globalError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {globalError}
        </div>
      )}

      {/* Basic Info */}
      <div className="card p-6 space-y-6">
        <h2 className="font-semibold text-gray-900 border-b border-gray-200 pb-4">
          Meeting Details
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Client */}
          <div className="sm:col-span-2">
            <label htmlFor="clientId" className="label">
              Client <span className="text-red-500">*</span>
            </label>
            {loadingClients ? (
              <div className="input flex items-center justify-center">
                <span className="spinner-sm" />
              </div>
            ) : (
              <select
                id="clientId"
                name="clientId"
                value={formData.clientId}
                onChange={handleChange}
                className={errors.clientId ? 'input-error' : 'input'}
                disabled={loading || Boolean(initialClientId)}
              >
                <option value="">Select a client...</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name}{client.company ? ` (${client.company})` : ''}
                  </option>
                ))}
              </select>
            )}
            {errors.clientId && <p className="error-text">{errors.clientId}</p>}
          </div>

          {/* Date */}
          <div>
            <label htmlFor="meetingDate" className="label">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              id="meetingDate"
              name="meetingDate"
              value={formData.meetingDate}
              onChange={handleChange}
              className={errors.meetingDate ? 'input-error' : 'input'}
              disabled={loading}
            />
            {errors.meetingDate && <p className="error-text">{errors.meetingDate}</p>}
          </div>

          {/* Type */}
          <div>
            <label htmlFor="meetingType" className="label">Type</label>
            <select
              id="meetingType"
              name="meetingType"
              value={formData.meetingType}
              onChange={handleChange}
              className="input"
              disabled={loading}
            >
              {meetingTypes.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          {/* Mood */}
          <div className="sm:col-span-2">
            <label className="label">How did it go?</label>
            <div className="flex flex-wrap gap-2">
              {moods.map(mood => (
                <button
                  key={mood.value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, mood: mood.value }))}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    formData.mood === mood.value
                      ? `${mood.color} border-current`
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                  disabled={loading}
                >
                  {mood.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Note Content */}
      <div className="card p-6 space-y-6">
        <h2 className="font-semibold text-gray-900 border-b border-gray-200 pb-4">
          Meeting Notes
          <span className="ml-2 text-sm font-normal text-gray-500">
            (AI will analyze this to extract insights)
          </span>
        </h2>

        {/* Summary */}
        <div>
          <label htmlFor="summary" className="label">Quick Summary</label>
          <textarea
            id="summary"
            name="summary"
            value={formData.summary}
            onChange={handleChange}
            rows={2}
            placeholder="One-liner about what happened..."
            className={errors.summary ? 'input-error' : 'input'}
            disabled={loading}
          />
          {errors.summary && <p className="error-text">{errors.summary}</p>}
        </div>

        {/* Discussed */}
        <div>
          <label htmlFor="discussed" className="label">What We Discussed</label>
          <textarea
            id="discussed"
            name="discussed"
            value={formData.discussed}
            onChange={handleChange}
            rows={4}
            placeholder="Main topics, updates, questions raised..."
            className="input"
            disabled={loading}
          />
        </div>

        {/* Decisions */}
        <div>
          <label htmlFor="decisions" className="label">Decisions Made</label>
          <textarea
            id="decisions"
            name="decisions"
            value={formData.decisions}
            onChange={handleChange}
            rows={2}
            placeholder="Any agreements or decisions..."
            className="input"
            disabled={loading}
          />
        </div>

        {/* Action Items */}
        <div>
          <label htmlFor="actionItemsRaw" className="label">
            Action Items
            <span className="ml-2 text-xs font-normal text-gray-400">(AI will extract these)</span>
          </label>
          <textarea
            id="actionItemsRaw"
            name="actionItemsRaw"
            value={formData.actionItemsRaw}
            onChange={handleChange}
            rows={3}
            placeholder="- I need to send proposal by Friday&#10;- Client will review budget&#10;- Schedule follow-up next week"
            className="input"
            disabled={loading}
          />
        </div>

        {/* Concerns */}
        <div>
          <label htmlFor="concerns" className="label">
            Concerns or Red Flags
            <span className="ml-2 text-xs font-normal text-gray-400">(affects health score)</span>
          </label>
          <textarea
            id="concerns"
            name="concerns"
            value={formData.concerns}
            onChange={handleChange}
            rows={2}
            placeholder="Any worries, hesitations, or issues raised..."
            className="input"
            disabled={loading}
          />
        </div>

        {/* Personal Notes */}
        <div>
          <label htmlFor="personalNotes" className="label">
            Personal Notes
            <span className="ml-2 text-xs font-normal text-gray-400">(for your reference)</span>
          </label>
          <textarea
            id="personalNotes"
            name="personalNotes"
            value={formData.personalNotes}
            onChange={handleChange}
            rows={2}
            placeholder="Kids names, hobbies, preferences mentioned..."
            className="input"
            disabled={loading}
          />
        </div>

        {/* Next Steps */}
        <div>
          <label htmlFor="nextSteps" className="label">Next Steps</label>
          <textarea
            id="nextSteps"
            name="nextSteps"
            value={formData.nextSteps}
            onChange={handleChange}
            rows={2}
            placeholder="What happens next..."
            className="input"
            disabled={loading}
          />
        </div>
      </div>

      {/* AI Processing Note */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex items-start gap-3">
        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-indigo-900">AI Processing</p>
          <p className="text-sm text-indigo-700">
            After saving, AI will analyze your notes to extract action items, detect sentiment,
            identify personal details, and update the client's health score.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <a
          href={initialClientId ? `/clients/${initialClientId}` : '/notes'}
          className="btn-secondary"
        >
          Cancel
        </a>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? (
            <>
              <span className="spinner-sm" />
              {isEditing ? 'Saving...' : 'Creating...'}
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {isEditing ? 'Save Changes' : 'Save Note'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
