import { useState } from 'react';
import Button from '$/components/Button';
import Modal from '$/components/Modal';
import { FormField } from '$/components/FormField';
import { useToast } from '$/components/ToastContext';

type Tag = {
  id: string;
  name: string;
  sermons: number;
  weight: number;
  source: 'AI' | 'Manual';
};

export default function TagManager() {
  const { showToast } = useToast();

  const [tags, setTags] = useState<Tag[]>([]);
  const [activeModal, setActiveModal] = useState<'add' | 'edit' | 'delete' | null>(null);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);

  // form state
  const [name, setName] = useState('');
  const [sermons, setSermons] = useState(0);
  const [weight, setWeight] = useState(0);
  const [source, setSource] = useState<'AI' | 'Manual'>('Manual');

  const resetForm = () => {
    setName('');
    setSermons(0);
    setWeight(0);
    setSource('Manual');
  };

  const openAdd = () => {
    resetForm();
    setSelectedTag(null);
    setActiveModal('add');
  };

  const openEdit = (tag: Tag) => {
    setSelectedTag(tag);
    setName(tag.name);
    setSermons(tag.sermons);
    setWeight(tag.weight);
    setSource(tag.source);
    setActiveModal('edit');
  };

  const openDelete = (tag: Tag) => {
    setSelectedTag(tag);
    setActiveModal('delete');
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedTag(null);
  };

  const handleSave = () => {
    if (!name.trim()) {
      showToast('Tag name cannot be empty', 'error');
      return;
    }

    const safeWeight = Math.max(0, Math.min(100, weight));
    const safeSermons = Math.max(0, sermons);

    if (activeModal === 'add') {
      const newTag: Tag = {
        id: crypto.randomUUID(),
        name,
        sermons: safeSermons,
        weight: safeWeight,
        source,
      };

      setTags((prev) => [...prev, newTag]);
      showToast('Tag added', 'success');
    }

    if (activeModal === 'edit' && selectedTag) {
      setTags((prev) =>
        prev.map((t) =>
          t.id === selectedTag.id
            ? { ...t, name, sermons: safeSermons, weight: safeWeight, source }
            : t
        )
      );

      showToast('Tag updated', 'success');
    }

    closeModal();
    resetForm();
  };

  const handleDelete = () => {
    if (!selectedTag) return;

    setTags((prev) => prev.filter((t) => t.id !== selectedTag.id));
    showToast('Tag deleted', 'success');

    closeModal();
    resetForm();
  };

  return (
    <div>
      <Button onClick={openAdd}>Add Tag</Button>

      <table id="s-tags">
        <tbody>
          {tags.map((tag) => (
            <tr key={tag.id}>
              <td>
                <span className="tag tg">{tag.name}</span>
              </td>
              <td>{tag.sermons}</td>
              <td>
                <div className="pbar" style={{ width: 80 }}>
                  <div className="pfill" style={{ width: `${tag.weight}%` }} />
                </div>
              </td>
              <td>
                <span className={`tag ${tag.source === 'AI' ? 'tblu' : 'tgr'}`}>
                  {tag.source}
                </span>
              </td>
              <td>
                <Button onClick={() => openEdit(tag)}>Edit</Button>
                <Button onClick={() => openDelete(tag)}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add/Edit Modal */}
      {(activeModal === 'add' || activeModal === 'edit') && (
        <Modal
          isOpen
          onClose={closeModal}
          title={activeModal === 'add' ? 'Add Tag' : 'Edit Tag'}
          footer={
            <>
              <Button variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!name.trim()}
              >
                {activeModal === 'add' ? 'Add' : 'Save'}
              </Button>
            </>
          }
        >
          <FormField label="Tag Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <FormField label="Sermons">
            <input
              type="number"
              value={sermons}
              onChange={(e) => {
                const value = e.target.value;
                setSermons(value === '' ? 0 : Number(value));
              }}
            />
          </FormField>

          <FormField label="Weight (%)">
            <input
              type="number"
              value={weight}
              onChange={(e) => {
                const value = e.target.value;
                setWeight(value === '' ? 0 : Number(value));
              }}
            />
          </FormField>

          <FormField label="Source">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as 'AI' | 'Manual')}
            >
              <option value="Manual">Manual</option>
              <option value="AI">AI</option>
            </select>
          </FormField>
        </Modal>
      )}

      {/* Delete Modal */}
      {activeModal === 'delete' && selectedTag && (
        <Modal
          isOpen
          onClose={closeModal}
          title="Delete Tag"
          footer={
            <>
              <Button variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete}>
                Delete
              </Button>
            </>
          }
        >
          Are you sure you want to delete "{selectedTag.name}"?
        </Modal>
      )}
    </div>
  );
}