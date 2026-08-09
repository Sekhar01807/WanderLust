let cropper;
let currentFileInput;
let currentPreviewImg;
let cropperModalElement;
let cropperModal;

document.addEventListener("DOMContentLoaded", () => {
    cropperModalElement = document.getElementById('cropperModal');
    if(cropperModalElement) {
        cropperModal = new bootstrap.Modal(cropperModalElement);
        
        cropperModalElement.addEventListener('hidden.bs.modal', function () {
            if(cropper) {
                cropper.destroy();
                cropper = null;
            }
        });
    }

    const cropImageBtn = document.getElementById('cropImageBtn');
    if(cropImageBtn) {
        cropImageBtn.addEventListener('click', function() {
            if (!cropper) return;
            
            // Get cropped canvas with high quality
            const canvas = cropper.getCroppedCanvas({
                width: 1200,
                height: 1200,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high',
            });
            
            canvas.toBlob((blob) => {
                if (!blob) return;

                // Update file input using DataTransfer
                const dataTransfer = new DataTransfer();
                const fileName = currentFileInput.files[0] ? currentFileInput.files[0].name : "cropped-image.jpg";
                const file = new File([blob], fileName, { type: "image/jpeg" });
                dataTransfer.items.add(file);
                currentFileInput.files = dataTransfer.files;
                
                // Update preview image
                if(currentPreviewImg) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        currentPreviewImg.src = e.target.result;
                        currentPreviewImg.style.display = 'block';
                        
                        // Profile specific fallback
                        const fallback = document.getElementById('profile-preview-fallback');
                        if (fallback) fallback.style.display = 'none';
                    };
                    reader.readAsDataURL(blob);
                }

                // Auto expand profile edit section if profile image was updated
                if (currentFileInput && currentFileInput.id === 'profileImage') {
                    const editSection = document.getElementById('editProfileSection');
                    const toggleBtn = document.getElementById('toggleEditProfileBtn');
                    if (editSection && editSection.style.display === 'none') {
                        editSection.style.display = 'block';
                        if (toggleBtn) {
                            toggleBtn.innerHTML = '<i class="fa-solid fa-xmark me-2"></i>Close Edit';
                            toggleBtn.classList.replace('btn-outline-danger', 'btn-secondary');
                        }
                    }
                }
                
                cropperModal.hide();
            }, 'image/jpeg', 0.9);
        });
    }
});

// Function to attach cropper to a specific file input
function setupImageCropper(inputId, previewId, aspectRatio = NaN) {
    const inputElement = document.getElementById(inputId);
    const previewElement = document.getElementById(previewId);
    
    if(!inputElement) return;
    
    // Remove previous listeners if any to prevent duplicates
    const newInputElement = inputElement.cloneNode(true);
    inputElement.parentNode.replaceChild(newInputElement, inputElement);
    
    newInputElement.addEventListener('change', function(e) {
        if (e.target.files && e.target.files[0]) {
            currentFileInput = newInputElement;
            currentPreviewImg = previewElement;
            
            let reader = new FileReader();
            reader.onload = function(event) {
                const imageToCrop = document.getElementById('imageToCrop');
                imageToCrop.src = event.target.result;
                
                // Reset cropper if it exists
                if(cropper) {
                    cropper.destroy();
                    cropper = null;
                }

                cropperModal.show();
                
                // Initialize cropper when modal is FULLY shown
                const onModalShown = function() {
                    // Force a small delay to ensure image is rendered in the DOM
                    setTimeout(() => {
                        cropper = new Cropper(imageToCrop, {
                            aspectRatio: aspectRatio,
                            viewMode: 2,
                            autoCropArea: 0.8,
                            responsive: true,
                            restore: false,
                            checkOrientation: false,
                            modal: true,
                            guides: true,
                            center: true,
                            highlight: true,
                            background: true
                        });
                    }, 100);
                };

                // Use 'one' listener pattern
                cropperModalElement.addEventListener('shown.bs.modal', onModalShown, { once: true });
            }
            reader.readAsDataURL(e.target.files[0]);
        }
    });
}
