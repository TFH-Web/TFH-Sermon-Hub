import { useState, type ChangeEvent } from "react";
import { useToast } from "$/components/ToastContext";
import Button from "$/components/Button";
import Modal from "$/components/Modal";
import { FormField, FormRow } from "$/components/FormField";

interface NewSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewSeriesModal({
  isOpen,
  onClose,
}: NewSeriesModalProps) {
  const { showToast } = useToast();

  const [seriesName, setSeriesName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [primarySpeaker, setPrimarySpeaker] = useState("");

  const handleCreateSeries = () => {
    if (!seriesName.trim()) {
      showToast("Please fill in all required fields", "error");
      return;
    }

    onClose();
    showToast("Series created", "success");

    setSeriesName("");
    setDescription("");
    setStartDate("");
    setPrimarySpeaker("");
  };

  const handleSeriesNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSeriesName(event.target.value);
  };

  const handleDescriptionChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDescription(event.target.value);
  };

  const handleStartDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    setStartDate(event.target.value);
  };

  const handlePrimarySpeakerChange = (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    setPrimarySpeaker(event.target.value);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Series"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreateSeries}>
            Create Series
          </Button>
        </>
      }
    >
      <div>
        <FormField label="Series Name">
          <input
            type="text"
            placeholder="e.g. Live Your Best Life"
            name="seriesName"
            value={seriesName}
            onChange={handleSeriesNameChange}
          />
        </FormField>

        <FormField label="Description">
          <input
            type="text"
            placeholder="Brief description of the series"
            name="description"
            value={description}
            onChange={handleDescriptionChange}
          />
        </FormField>

        <FormRow>
          <FormField label="Start Date">
            <input
              type="date"
              value={startDate}
              onChange={handleStartDateChange}
            />
          </FormField>

          <FormField label="Primary Speaker">
            <select
              value={primarySpeaker}
              onChange={handlePrimarySpeakerChange}
            >
              <option value="">Select speaker</option>
              <option value="dave-patterson">Dave Patterson</option>
              <option value="guest-speaker">Guest Speaker</option>
            </select>
          </FormField>
        </FormRow>
      </div>
    </Modal>
  );
}
