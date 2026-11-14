import { useEffect, useRef } from 'react';

/** Uses a local file preview; uploaded photos never need a public storage URL. */
export default function EstimatePhotoPreview({ file }: { file: File }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <img
      ref={imageRef}
      alt={`Preview of ${file.name}`}
      className="h-40 w-full rounded-sm bg-neutral-100 object-contain"
    />
  );
}
