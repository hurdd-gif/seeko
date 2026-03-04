'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

export function SettingsPanel() {
  const [analytics, setAnalytics] = useState(true);
  const [betaFeatures, setBetaFeatures] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your workspace and account settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Update your workspace information.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Workspace Name</Label>
            <Input id="workspace-name" defaultValue="SEEKO Studio" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-desc">Description</Label>
            <Textarea
              id="workspace-desc"
              placeholder="Describe your workspace..."
              defaultValue="Game development studio workspace."
              rows={3}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t pt-6">
          <p className="text-xs text-muted-foreground">Changes are saved automatically.</p>
          <Button>Save</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Configure workspace behavior.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col">
            <div className="flex items-center justify-between py-4">
              <div>
                <Label className="text-sm font-medium">Analytics</Label>
                <p className="text-xs text-muted-foreground">Collect usage analytics for your workspace.</p>
              </div>
              <Switch checked={analytics} onCheckedChange={setAnalytics} />
            </div>
            <Separator />
            <div className="flex items-center justify-between py-4">
              <div>
                <Label className="text-sm font-medium">Beta Features</Label>
                <p className="text-xs text-muted-foreground">Enable experimental features in your workspace.</p>
              </div>
              <Switch checked={betaFeatures} onCheckedChange={setBetaFeatures} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions for your workspace.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-md border border-destructive/30 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Delete Workspace</p>
              <p className="text-xs text-muted-foreground">Permanently delete this workspace and all data.</p>
            </div>
            <Button variant="destructive" size="sm">Delete</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
