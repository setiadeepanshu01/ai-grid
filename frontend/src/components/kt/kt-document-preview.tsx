import { useEffect, useState } from "react";
import { 
  Box, 
  Button, 
  Card, 
  Drawer, 
  Group, 
  Loader, 
  ScrollArea, 
  Stack, 
  Text, 
  Title 
} from "@mantine/core";
import { IconFileText, IconX } from "@tabler/icons-react";
import { useStore } from "@config/store";
import { AnswerTableRow } from "@config/store/store.types";

interface DocumentPreviewProps {
  row: AnswerTableRow | null;
  onClose: () => void;
}

export function KtDocumentPreview({ row, onClose }: DocumentPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const document = row?.sourceData?.type === 'document' ? row.sourceData.document : null;
  
  // Get chunks from the store for this document
  const chunks = useStore(store => {
    if (!row) return [];
    
    // Collect all chunks for this row
    const allChunks = store.getTable().chunks;
    const rowChunks = Object.entries(allChunks)
      .filter(([key]) => key.startsWith(`${row.id}-`))
      .flatMap(([_, chunks]) => chunks);
      
    return rowChunks;
  });
  
  useEffect(() => {
    if (!document) {
      setContent([]);
      setError(null);
      return;
    }
    
    // If we have chunks, use them as the document content
    if (chunks.length > 0) {
      setContent(chunks.map(chunk => chunk.text || chunk.content));
      setError(null);
      return;
    }
    
    // Otherwise, we need to simulate loading the document content
    setLoading(true);
    setError(null);
    
    // Simulate loading document content
    const timer = setTimeout(() => {
      setLoading(false);
      
      // If we don't have real content, show a placeholder message
      const pageCount = document.page_count || 'unknown number of';
      setContent([
        `This is a preview of document: ${document.name}`,
        `To see actual document content, extract data from this document first.`,
        `The document has ${pageCount} pages.`
      ]);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [document, chunks]);
  
  if (!row || !document) {
    return null;
  }
  
  const pageCount = document.page_count || 'Unknown';
  const author = document.author || 'Unknown';
  const tag = document.tag || '';
  
  return (
    <Drawer
      opened={!!document}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconFileText size={20} />
          <Text>Document Preview</Text>
        </Group>
      }
      position="right"
      size="md"
    >
      <Stack>
        <Card withBorder>
          <Title order={4}>{document.name}</Title>
          <Text size="sm" c="dimmed">Pages: {pageCount}</Text>
          <Text size="sm" c="dimmed">Author: {author}</Text>
          {tag && (
            <Text size="sm" c="dimmed">Tag: {tag}</Text>
          )}
        </Card>
        
        <ScrollArea h="calc(100vh - 200px)" type="auto">
          {loading ? (
            <Box ta="center" py="xl">
              <Loader />
              <Text mt="md">Loading document content...</Text>
            </Box>
          ) : error ? (
            <Box ta="center" py="xl">
              <IconX size={40} color="red" />
              <Text mt="md" c="red">{error}</Text>
            </Box>
          ) : content.length > 0 ? (
            <Stack>
              {content.map((text, index) => (
                <Card key={index} withBorder p="md">
                  <Text>{text}</Text>
                </Card>
              ))}
            </Stack>
          ) : (
            <Box ta="center" py="xl">
              <Text>No content available for this document.</Text>
            </Box>
          )}
        </ScrollArea>
        
        <Button fullWidth onClick={onClose}>Close Preview</Button>
      </Stack>
    </Drawer>
  );
}
