// src/components/pages/Documents.tsx
import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../hooks/useLocale';
import { documentsApi, MedicalDocument } from '../../services/api';
import {
  FileText,
  Upload,
  Folder,
  Search,
  Filter,
  Download,
  Eye,
  Edit3,
  Trash2,
  X,
  Calendar,
  User,
  Building2,
  Check,
  Image,
  File,
  ChevronDown,
  AlertCircle,
  HardDrive,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface DocumentStats {
  total: number;
  byCategory: Record<string, number>;
  totalSize: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  EMERGENCY_PROFILE: 'bg-blue-100 text-blue-700',
  LAB_RESULTS: 'bg-purple-100 text-purple-700',
  IMAGING: 'bg-indigo-100 text-indigo-700',
  PRESCRIPTIONS: 'bg-green-100 text-green-700',
  DISCHARGE_SUMMARY: 'bg-orange-100 text-orange-700',
  SURGICAL_REPORT: 'bg-red-100 text-red-700',
  VACCINATION: 'bg-teal-100 text-teal-700',
  INSURANCE: 'bg-yellow-100 text-yellow-700',
  IDENTIFICATION: 'bg-gray-100 text-gray-700',
  OTHER: 'bg-slate-100 text-slate-700',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  EMERGENCY_PROFILE: <FileText className="w-5 h-5" />,
  LAB_RESULTS: <FileText className="w-5 h-5" />,
  IMAGING: <Image className="w-5 h-5" />,
  PRESCRIPTIONS: <FileText className="w-5 h-5" />,
  DISCHARGE_SUMMARY: <FileText className="w-5 h-5" />,
  SURGICAL_REPORT: <FileText className="w-5 h-5" />,
  VACCINATION: <FileText className="w-5 h-5" />,
  INSURANCE: <FileText className="w-5 h-5" />,
  IDENTIFICATION: <FileText className="w-5 h-5" />,
  OTHER: <File className="w-5 h-5" />,
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function Documents() {
  const { t } = useTranslation('documents');
  const { formatDate } = useLocale();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<MedicalDocument | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Form state for upload/edit
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'OTHER',
    documentDate: '',
    doctorName: '',
    institution: '',
    isVisible: true,
  });

  // Category labels derived from translations
  const CATEGORY_LABELS: Record<string, string> = {
    EMERGENCY_PROFILE: t('categories.EMERGENCY_PROFILE'),
    LAB_RESULTS: t('categories.LAB_RESULTS'),
    IMAGING: t('categories.IMAGING'),
    PRESCRIPTIONS: t('categories.PRESCRIPTIONS'),
    DISCHARGE_SUMMARY: t('categories.DISCHARGE_SUMMARY'),
    SURGICAL_REPORT: t('categories.SURGICAL_REPORT'),
    VACCINATION: t('categories.VACCINATION'),
    INSURANCE: t('categories.INSURANCE'),
    IDENTIFICATION: t('categories.IDENTIFICATION'),
    OTHER: t('categories.OTHER'),
  };

  // Queries
  const { data: documentsData, isLoading } = useQuery({
    queryKey: ['documents', selectedCategory, searchQuery],
    queryFn: () => documentsApi.list({
      category: selectedCategory || undefined,
      search: searchQuery || undefined
    }),
  });

  const { data: statsData } = useQuery({
    queryKey: ['documents-stats'],
    queryFn: () => documentsApi.getStats(),
  });

  const documents: MedicalDocument[] = documentsData?.data?.documents || [];
  const stats: DocumentStats = statsData?.data?.stats || { total: 0, byCategory: {}, totalSize: 0 };

  // Mutations
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error(t('toast.noFile'));
      return documentsApi.upload(uploadFile, {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        documentDate: formData.documentDate || undefined,
        doctorName: formData.doctorName || undefined,
        institution: formData.institution || undefined,
        isVisible: formData.isVisible,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents-stats'] });
      toast.success(t('toast.uploadSuccess'));
      closeUploadModal();
    },
    onError: (error: any) => {
      toast.error(error.message || t('toast.uploadError'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDocument) throw new Error(t('toast.noDocument'));
      return documentsApi.update(selectedDocument.id, {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        documentDate: formData.documentDate || undefined,
        doctorName: formData.doctorName || undefined,
        institution: formData.institution || undefined,
        isVisible: formData.isVisible,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success(t('toast.updateSuccess'));
      closeEditModal();
    },
    onError: (error: any) => {
      toast.error(error.message || t('toast.updateError'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDocument) throw new Error(t('toast.noDocument'));
      return documentsApi.delete(selectedDocument.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents-stats'] });
      toast.success(t('toast.deleteSuccess'));
      closeDeleteConfirm();
    },
    onError: (error: any) => {
      toast.error(error.message || t('toast.deleteError'));
    },
  });

  // Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error(t('toast.fileTypeError'));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('toast.fileSizeError'));
      return;
    }

    setUploadFile(file);
    // Pre-fill title with filename
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    setFormData(prev => ({ ...prev, title: nameWithoutExt }));
  };

  const openUploadModal = () => {
    setFormData({
      title: '',
      description: '',
      category: 'OTHER',
      documentDate: '',
      doctorName: '',
      institution: '',
      isVisible: true,
    });
    setUploadFile(null);
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setUploadFile(null);
    setFormData({
      title: '',
      description: '',
      category: 'OTHER',
      documentDate: '',
      doctorName: '',
      institution: '',
      isVisible: true,
    });
  };

  const openViewModal = async (doc: MedicalDocument) => {
    setSelectedDocument(doc);
    setShowViewModal(true);
    setShowPreview(false);
    setPreviewUrl(null);

    // Auto-load preview for images
    if (doc.fileType.includes('image')) {
      loadPreview(doc.id);
    }
  };

  const loadPreview = async (docId: string) => {
    try {
      setLoadingPreview(true);
      const response = await documentsApi.getDownloadUrl(docId);
      if (response.data?.downloadUrl) {
        setPreviewUrl(response.data.downloadUrl);
        setShowPreview(true);
      }
    } catch (error) {
      toast.error(t('toast.previewError'));
    } finally {
      setLoadingPreview(false);
    }
  };

  const closeViewModal = () => {
    setShowViewModal(false);
    setSelectedDocument(null);
    setPreviewUrl(null);
    setShowPreview(false);
  };

  const openEditModal = (doc: MedicalDocument) => {
    setSelectedDocument(doc);
    setFormData({
      title: doc.title,
      description: doc.description || '',
      category: doc.category,
      documentDate: doc.documentDate ? doc.documentDate.split('T')[0] : '',
      doctorName: doc.doctorName || '',
      institution: doc.institution || '',
      isVisible: doc.isVisible,
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setSelectedDocument(null);
  };

  const openDeleteConfirm = (doc: MedicalDocument) => {
    setSelectedDocument(doc);
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setSelectedDocument(null);
  };

  const handleDownload = async (doc: MedicalDocument) => {
    try {
      const response = await documentsApi.getDownloadUrl(doc.id);
      if (response.data?.downloadUrl) {
        window.open(response.data.downloadUrl, '_blank');
      } else {
        toast.error(t('toast.downloadError'));
      }
    } catch {
      toast.error(t('toast.downloadErrorGeneric'));
    }
  };

  // Group documents by category for display
  const documentsByCategory = useMemo(() => {
    const grouped: Record<string, MedicalDocument[]> = {};
    documents.forEach(doc => {
      if (!grouped[doc.category]) {
        grouped[doc.category] = [];
      }
      grouped[doc.category].push(doc);
    });
    return grouped;
  }, [documents]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse" role="status" aria-label={t('loading', { defaultValue: 'Cargando documentos' })}>
        <div className="h-8 bg-gray-200 rounded w-48" aria-hidden="true"></div>
        <div className="card h-96 bg-gray-100" aria-hidden="true"></div>
      </div>
    );
  }

  return (
    <section className="space-y-6 animate-fade-in" aria-labelledby="documents-title">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 id="documents-title" className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('subtitle')}
          </p>
        </div>
        <button onClick={openUploadModal} className="btn-primary">
          <Upload className="w-5 h-5 mr-2" aria-hidden="true" />
          {t('uploadButton')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-vida-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-vida-100 rounded-lg" aria-hidden="true">
              <FileText className="w-5 h-5 text-vida-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">{t('stats.documents')}</p>
            </div>
          </div>
        </div>
        <div className="card bg-gradient-to-br from-salud-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-salud-100 rounded-lg" aria-hidden="true">
              <Folder className="w-5 h-5 text-salud-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {Object.keys(stats.byCategory).length}
              </p>
              <p className="text-sm text-gray-500">{t('stats.categories')}</p>
            </div>
          </div>
        </div>
        <div className="card bg-gradient-to-br from-coral-50 to-white col-span-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-coral-100 rounded-lg" aria-hidden="true">
              <HardDrive className="w-5 h-5 text-coral-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatFileSize(stats.totalSize)}</p>
              <p className="text-sm text-gray-500">{t('stats.storageUsed')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
            <label htmlFor="doc-search" className="sr-only">{t('filters.searchPlaceholder')}</label>
            <input
              id="doc-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('filters.searchPlaceholder')}
              className="input pl-10"
            />
          </div>
          <div className="relative min-w-[200px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
            <label htmlFor="doc-category" className="sr-only">{t('filters.allCategories')}</label>
            <select
              id="doc-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input pl-10 appearance-none cursor-pointer"
            >
              <option value="">{t('filters.allCategories')}</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Documents List */}
      {documents.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('emptyState.title')}</h3>
          <p className="text-gray-500 mb-6">
            {searchQuery || selectedCategory
              ? t('emptyState.withFilters')
              : t('emptyState.noDocuments')}
          </p>
          {!searchQuery && !selectedCategory && (
            <button onClick={openUploadModal} className="btn-primary inline-flex">
              <Upload className="w-5 h-5 mr-2" aria-hidden="true" />
              {t('uploadButton')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(documentsByCategory).map(([category, docs]) => (
            <div key={category} className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-700'}`} aria-hidden="true">
                  {CATEGORY_ICONS[category] || <File className="w-5 h-5" />}
                </div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {CATEGORY_LABELS[category] || category}
                </h2>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-sm rounded-full">
                  {docs.length}
                </span>
              </div>

              <div className="space-y-3">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="p-2 bg-white rounded-lg border border-gray-200" aria-hidden="true">
                        {doc.fileType.includes('pdf') ? (
                          <FileText className="w-6 h-6 text-red-500" aria-hidden="true" />
                        ) : doc.fileType.includes('image') ? (
                          <Image className="w-6 h-6 text-blue-500" aria-hidden="true" />
                        ) : (
                          <File className="w-6 h-6 text-gray-500" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-gray-900 truncate">{doc.title}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" aria-hidden="true" />
                            {doc.documentDate ? formatDate(doc.documentDate) : '-'}
                          </span>
                          <span>{formatFileSize(doc.fileSize)}</span>
                          {!doc.isVisible && (
                            <span className="text-orange-600 flex items-center gap-1">
                              <AlertCircle className="w-4 h-4" aria-hidden="true" />
                              {t('document.notVisibleInEmergency')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openViewModal(doc)}
                        className="p-2 text-gray-400 hover:text-vida-600 hover:bg-vida-50 rounded-lg transition-colors"
                        aria-label={`${t('tooltips.view')} — ${doc.title}`}
                      >
                        <Eye className="w-5 h-5" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="p-2 text-gray-400 hover:text-salud-600 hover:bg-salud-50 rounded-lg transition-colors"
                        aria-label={`${t('tooltips.download')} — ${doc.title}`}
                      >
                        <Download className="w-5 h-5" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => openEditModal(doc)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        aria-label={`${t('tooltips.edit')} — ${doc.title}`}
                      >
                        <Edit3 className="w-5 h-5" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => openDeleteConfirm(doc)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        aria-label={`${t('tooltips.delete')} — ${doc.title}`}
                      >
                        <Trash2 className="w-5 h-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={closeUploadModal} aria-hidden="true" />

            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="upload-modal-title"
              className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
                <h3 id="upload-modal-title" className="text-lg font-semibold text-gray-900">{t('uploadModal.title')}</h3>
                <button
                  onClick={closeUploadModal}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                  aria-label={t('uploadModal.buttons.cancel')}
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Drop zone */}
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    dragActive
                      ? 'border-vida-500 bg-vida-50'
                      : uploadFile
                      ? 'border-salud-500 bg-salud-50'
                      : 'border-gray-300 hover:border-vida-400 hover:bg-gray-50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  />
                  {uploadFile ? (
                    <div className="flex flex-col items-center">
                      <Check className="w-12 h-12 text-salud-500 mb-3" aria-hidden="true" />
                      <p className="font-medium text-gray-900">{uploadFile.name}</p>
                      <p className="text-sm text-gray-500 mt-1">{formatFileSize(uploadFile.size)}</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadFile(null);
                        }}
                        className="text-sm text-red-600 hover:text-red-700 mt-2"
                      >
                        {t('uploadModal.dropzone.changeFile')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <Upload className="w-12 h-12 text-gray-400 mb-3" aria-hidden="true" />
                      <p className="font-medium text-gray-900">{t('uploadModal.dropzone.drag')}</p>
                      <p className="text-sm text-gray-500 mt-1">{t('uploadModal.dropzone.click')}</p>
                      <p className="text-xs text-gray-400 mt-2">{t('uploadModal.dropzone.formats')}</p>
                    </div>
                  )}
                </div>

                {/* Form fields */}
                <div>
                  <label htmlFor="upload-title" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.title')}</label>
                  <input
                    id="upload-title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="input"
                    placeholder={t('uploadModal.fields.titlePlaceholder')}
                  />
                </div>

                <div>
                  <label htmlFor="upload-category" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.category')}</label>
                  <select
                    id="upload-category"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="input"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="upload-description" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.description')}</label>
                  <textarea
                    id="upload-description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="input"
                    rows={2}
                    placeholder={t('uploadModal.fields.descriptionPlaceholder')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="upload-document-date" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.documentDate')}</label>
                    <input
                      id="upload-document-date"
                      type="date"
                      value={formData.documentDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, documentDate: e.target.value }))}
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor="upload-doctor" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.doctor')}</label>
                    <input
                      id="upload-doctor"
                      type="text"
                      value={formData.doctorName}
                      onChange={(e) => setFormData(prev => ({ ...prev, doctorName: e.target.value }))}
                      className="input"
                      placeholder={t('uploadModal.fields.doctorPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="upload-institution" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.institution')}</label>
                  <input
                    id="upload-institution"
                    type="text"
                    value={formData.institution}
                    onChange={(e) => setFormData(prev => ({ ...prev, institution: e.target.value }))}
                    className="input"
                    placeholder={t('uploadModal.fields.institutionPlaceholder')}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="upload-is-visible"
                    type="checkbox"
                    checked={formData.isVisible}
                    onChange={(e) => setFormData(prev => ({ ...prev, isVisible: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <label htmlFor="upload-is-visible" className="relative inline-flex items-center cursor-pointer" aria-hidden="true">
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-vida-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-salud-500"></div>
                  </label>
                  <label htmlFor="upload-is-visible" className="text-sm text-gray-700 cursor-pointer">{t('uploadModal.fields.visibleInEmergency')}</label>
                </div>
              </div>

              <div className="p-4 border-t bg-gray-50 flex gap-3">
                <button onClick={closeUploadModal} className="btn-secondary flex-1">
                  {t('uploadModal.buttons.cancel')}
                </button>
                <button
                  onClick={() => uploadMutation.mutate()}
                  disabled={!uploadFile || !formData.title || uploadMutation.isPending}
                  className="btn-primary flex-1"
                  aria-busy={uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
                      {t('uploadModal.buttons.uploading')}
                    </div>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 mr-2" aria-hidden="true" />
                      {t('uploadModal.buttons.upload')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedDocument && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={closeViewModal} aria-hidden="true" />

            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="view-modal-title"
              className={`relative bg-white rounded-xl shadow-xl w-full transition-all ${showPreview ? 'max-w-5xl' : 'max-w-lg'}`}
            >
              <div className="flex items-center justify-between p-4 border-b">
                <h3 id="view-modal-title" className="text-lg font-semibold text-gray-900">{t('viewModal.title')}</h3>
                <button
                  onClick={closeViewModal}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                  aria-label={t('viewModal.buttons.close')}
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <div className={`flex ${showPreview ? 'flex-row' : 'flex-col'}`}>
                {/* Document Preview */}
                {showPreview && previewUrl && (
                  <div className="flex-1 border-r border-gray-200 bg-gray-100 min-h-[500px] max-h-[70vh] overflow-hidden">
                    {selectedDocument.fileType.includes('image') ? (
                      <div className="w-full h-full flex items-center justify-center p-4">
                        <img
                          src={previewUrl}
                          alt={selectedDocument.title}
                          className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                        />
                      </div>
                    ) : selectedDocument.fileType.includes('pdf') ? (
                      <iframe
                        src={previewUrl}
                        className="w-full h-full min-h-[500px]"
                        title={selectedDocument.title}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500">
                        <div className="text-center">
                          <File className="w-16 h-16 mx-auto mb-4 text-gray-300" aria-hidden="true" />
                          <p>{t('viewModal.noPreview')}</p>
                          <p className="text-sm">{t('viewModal.noPreviewDesc')}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Document Details */}
                <div className={`${showPreview ? 'w-80' : 'w-full'} p-6 space-y-4`}>
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${CATEGORY_COLORS[selectedDocument.category] || 'bg-gray-100 text-gray-700'}`} aria-hidden="true">
                      {selectedDocument.fileType.includes('pdf') ? (
                        <FileText className="w-8 h-8" aria-hidden="true" />
                      ) : selectedDocument.fileType.includes('image') ? (
                        <Image className="w-8 h-8" aria-hidden="true" />
                      ) : (
                        <File className="w-8 h-8" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-lg font-semibold text-gray-900 truncate">{selectedDocument.title}</h4>
                      <span className={`inline-block px-2 py-0.5 text-sm rounded-full mt-1 ${CATEGORY_COLORS[selectedDocument.category] || 'bg-gray-100 text-gray-700'}`}>
                        {CATEGORY_LABELS[selectedDocument.category] || selectedDocument.category}
                      </span>
                    </div>
                  </div>

                  {/* Preview Button */}
                  {!showPreview && (selectedDocument.fileType.includes('pdf') || selectedDocument.fileType.includes('image')) && (
                    <button
                      onClick={() => loadPreview(selectedDocument.id)}
                      disabled={loadingPreview}
                      aria-busy={loadingPreview}
                      className="w-full py-3 px-4 bg-vida-50 text-vida-700 rounded-lg hover:bg-vida-100 transition-colors flex items-center justify-center gap-2 font-medium"
                    >
                      {loadingPreview ? (
                        <>
                          <div className="w-5 h-5 border-2 border-vida-300 border-t-vida-600 rounded-full animate-spin" aria-hidden="true"></div>
                          {t('viewModal.loadingPreview')}
                        </>
                      ) : (
                        <>
                          <Eye className="w-5 h-5" aria-hidden="true" />
                          {t('viewModal.previewButton')}
                        </>
                      )}
                    </button>
                  )}

                  {selectedDocument.description && (
                    <p className="text-gray-600 text-sm">{selectedDocument.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">{t('viewModal.fields.date')}</p>
                      <p className="font-medium flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                        {selectedDocument.documentDate ? formatDate(selectedDocument.documentDate) : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">{t('viewModal.fields.size')}</p>
                      <p className="font-medium">{formatFileSize(selectedDocument.fileSize)}</p>
                    </div>
                    {selectedDocument.doctorName && (
                      <div className="col-span-2">
                        <p className="text-gray-500 text-xs">{t('viewModal.fields.doctor')}</p>
                        <p className="font-medium flex items-center gap-1">
                          <User className="w-3.5 h-3.5" aria-hidden="true" />
                          {selectedDocument.doctorName}
                        </p>
                      </div>
                    )}
                    {selectedDocument.institution && (
                      <div className="col-span-2">
                        <p className="text-gray-500 text-xs">{t('viewModal.fields.institution')}</p>
                        <p className="font-medium flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {selectedDocument.institution}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    {selectedDocument.isVisible ? (
                      <span className="px-2 py-1 bg-salud-100 text-salud-700 rounded-full flex items-center gap-1 text-xs">
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        {t('document.visibleInEmergency')}
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full flex items-center gap-1 text-xs">
                        <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        {t('document.notVisible')}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-gray-400 pt-2 border-t">
                    <p className="truncate">{t('viewModal.fields.fileName')}: {selectedDocument.fileName}</p>
                    <p>{t('viewModal.fields.uploadedAt')}: {formatDate(selectedDocument.createdAt)}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t bg-gray-50 flex gap-3">
                <button onClick={closeViewModal} className="btn-secondary flex-1">
                  {t('viewModal.buttons.close')}
                </button>
                <button onClick={() => handleDownload(selectedDocument)} className="btn-primary flex-1">
                  <Download className="w-5 h-5 mr-2" aria-hidden="true" />
                  {t('viewModal.buttons.download')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedDocument && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={closeEditModal} aria-hidden="true" />

            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-modal-title"
              className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
                <h3 id="edit-modal-title" className="text-lg font-semibold text-gray-900">{t('editModal.title')}</h3>
                <button
                  onClick={closeEditModal}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                  aria-label={t('editModal.buttons.cancel')}
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.title')}</label>
                  <input
                    id="edit-title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="edit-category" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.category')}</label>
                  <select
                    id="edit-category"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="input"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.description')}</label>
                  <textarea
                    id="edit-description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="input"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="edit-document-date" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.documentDate')}</label>
                    <input
                      id="edit-document-date"
                      type="date"
                      value={formData.documentDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, documentDate: e.target.value }))}
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-doctor" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.doctor')}</label>
                    <input
                      id="edit-doctor"
                      type="text"
                      value={formData.doctorName}
                      onChange={(e) => setFormData(prev => ({ ...prev, doctorName: e.target.value }))}
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="edit-institution" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadModal.fields.institution')}</label>
                  <input
                    id="edit-institution"
                    type="text"
                    value={formData.institution}
                    onChange={(e) => setFormData(prev => ({ ...prev, institution: e.target.value }))}
                    className="input"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="edit-is-visible"
                    type="checkbox"
                    checked={formData.isVisible}
                    onChange={(e) => setFormData(prev => ({ ...prev, isVisible: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <label htmlFor="edit-is-visible" className="relative inline-flex items-center cursor-pointer" aria-hidden="true">
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-vida-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-salud-500"></div>
                  </label>
                  <label htmlFor="edit-is-visible" className="text-sm text-gray-700 cursor-pointer">{t('uploadModal.fields.visibleInEmergency')}</label>
                </div>
              </div>

              <div className="p-4 border-t bg-gray-50 flex gap-3">
                <button onClick={closeEditModal} className="btn-secondary flex-1">
                  {t('editModal.buttons.cancel')}
                </button>
                <button
                  onClick={() => updateMutation.mutate()}
                  disabled={!formData.title || updateMutation.isPending}
                  className="btn-primary flex-1"
                  aria-busy={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
                      {t('editModal.buttons.saving')}
                    </div>
                  ) : (
                    <>
                      <Check className="w-5 h-5 mr-2" aria-hidden="true" />
                      {t('editModal.buttons.save')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedDocument && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={closeDeleteConfirm} aria-hidden="true" />

            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-modal-title"
              className="relative bg-white rounded-xl shadow-xl max-w-md w-full"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4" aria-hidden="true">
                  <Trash2 className="w-8 h-8 text-red-600" aria-hidden="true" />
                </div>
                <h3 id="delete-modal-title" className="text-lg font-semibold text-gray-900 mb-2">{t('deleteModal.title')}</h3>
                <p className="text-gray-600 mb-6">
                  {t('deleteModal.description', { name: selectedDocument.title })}
                </p>
                <div className="flex gap-3">
                  <button onClick={closeDeleteConfirm} className="btn-secondary flex-1">
                    {t('deleteModal.buttons.cancel')}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    aria-busy={deleteMutation.isPending}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? t('deleteModal.buttons.deleting') : t('deleteModal.buttons.delete')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
