import React, { useState, useRef } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from './ui';
import { X, Crop as CropIcon } from 'lucide-react';

interface ImageCropperModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCropComplete: (croppedFile: File) => void;
}

const ImageCropperModal: React.FC<ImageCropperModalProps> = ({ isOpen, imageSrc, onClose, onCropComplete }) => {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !imageSrc) return null;

  const handleSave = async () => {
    if (!completedCrop || completedCrop.width === 0 || completedCrop.height === 0 || !imgRef.current) {
        // If no crop was made, return the original image as a file
        try {
            const response = await fetch(imageSrc);
            const blob = await response.blob();
            const file = new File([blob], 'original.jpg', { type: blob.type || 'image/jpeg' });
            onCropComplete(file);
        } catch (err) {
            console.error(err);
        }
        return;
    }
    
    setIsProcessing(true);
    try {
      const image = imgRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('No 2d context');
      }

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      const pixelRatio = window.devicePixelRatio;

      canvas.width = Math.floor(completedCrop.width * scaleX * pixelRatio);
      canvas.height = Math.floor(completedCrop.height * scaleY * pixelRatio);

      ctx.scale(pixelRatio, pixelRatio);
      ctx.imageSmoothingQuality = 'high';

      const cropX = completedCrop.x * scaleX;
      const cropY = completedCrop.y * scaleY;

      ctx.save();
      ctx.translate(-cropX, -cropY);
      ctx.drawImage(
        image,
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
        0,
        0,
        image.naturalWidth,
        image.naturalHeight
      );
      ctx.restore();

      canvas.toBlob((blob) => {
        if (!blob) throw new Error('Canvas is empty');
        const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
        setIsProcessing(false);
        onCropComplete(file);
      }, 'image/jpeg', 0.95);
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <CropIcon size={20} className="text-blue-500" />
            Crop Image
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-4 bg-slate-50 flex items-center justify-center min-h-[300px]">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => setCompletedCrop(c)}
            className="max-h-full"
          >
            <img 
              ref={imgRef}
              src={imageSrc} 
              alt="Crop target" 
              className="max-h-[60vh] w-auto object-contain"
            />
          </ReactCrop>
        </div>
        
        <div className="p-4 border-t flex justify-end gap-3 bg-white">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isProcessing}>
            {isProcessing ? 'Processing...' : 'Crop & Save'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropperModal;
