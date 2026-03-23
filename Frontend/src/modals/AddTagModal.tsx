import { useState }  from "react";
// import "./AddTagModal.css"
import { useToast } from '$/components/ToastContext';
import Button from '$/components/Button';
import Modal from "$/components/Modal";
import { FormField } from "$/components/FormField";


interface AddTagModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function AddTagModal({
    isOpen, 
    onClose,
}: AddTagModalProps) {

    const { showToast } = useToast();
    const [tag, setTag] = useState('');
    const [category, setCategory] = useState('');
 
    const categories = [
        {value: 'topic', label: 'Topic' },
        {value: 'scripture', label: 'Scripture' },
        {value: 'emotion', label: 'Emotion' },
        {value: 'misc', label: 'Miscellaneous' },
    ]

    const handleTag = () => {
        if (!tag.trim()) {
            setTag('Tag is required');
            showToast('Please fill in all required fields', 'error');
            setTag('');
            return;
        }
        setTag('');
        onClose();
        showToast('Tag Added', 'success');
        setTag('');
    }
    const handleTagChange = event => {
        setTag(event.target.value);
    }
    const handleCategoryChange = event => {
        console.log("category was " + category);
        setCategory(event.target.value);
        console.log("category is now " + category);
    }


return (
    <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Add Tag"
        size="lg"
        footer={
        <>
            <Button
                variant="secondary"
                onClick={onClose}
            >
                Cancel
            </Button>
            <Button
                variant="primary"
                onClick={handleTag}
            >
                Add Tag
            </Button>

        </>
        }
    >
        <div>
            <FormField 
                label="Tag Name">
			    <input
				    type="text"
                    placeholder="e.g. forgiveness"
                    name="tag"
                    value={tag}
                    onChange={handleTagChange}
				/>
		    </FormField>
            {/* category change not setting right value */}
            <FormField label="Category (optional)">
					<select id="category-select" value={category} onChange={handleCategoryChange}>
						<option value="">General</option>
                        {categories.map((category) => (<option key = {category.value} value = {category.value}>
                            {category.label}
                        </option>
                        ))}
					</select>
				</FormField>
        </div>





    </Modal>


);


}




