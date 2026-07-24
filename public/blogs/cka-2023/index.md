![CKA-2023](/blogs/cka-2023/CKA-2023-1.png)

## 补充信息
```
#补全
# apt install bash-completion
source <(kubectl completion bash)

# kubectl config get-contexts  
# cat ~/.kube/config |grep current

# kubectl config current-context
kubectl config use-context

复制粘贴  ctrl+shift+c ctrl+shift+v
# edit编辑时只能使用空格，不要TAB否则保存不了
```

## Day1-RBAC 授权

[SA](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)

[RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/#rolebinding-example)

```
cani
Authorization Overview | Kubernetes
```



```
创建一个名为 deployment-clusterrole 且仅允许创建以下资源类型的新ClusterRole：
Deployment
StatefulSet
DaemonSet

在现有的 namespace app-team中创建一个名为cicd-token的新 ServiceAccount。
限于 namespace app-team中，将新的ClusterRole deployment-clusterrole绑定到新的 ServiceAccount cicd-token。
```

```
# kubectl create ns app-team
# kubectl create clusterrole deployment-clusterrole --verb=create --resource=deployments,statefulsets,daemonsets
# kubectl create serviceaccount cicd-token -n app-team
# kubectl create rolebinding cicd-token-rolebinding --clusterrole=deployment-clusterrole --serviceaccount=app-team:cicd-token -n app-team   #这里注意rolebinding的名称没指定 任取
```

```
测试服务账号（SA）权限：
kubectl --as=system:serviceaccount:app-team:cicd-token get pods -n app-team

[root@ek8s-master 1]# kubectl --as=system:serviceaccount:app-team:cicd-token create deployment web --image=nginx:alpine -n app-team
deployment.apps/web created

[root@ek8s-master 1]# kubectl get deployment -n app-team
NAME   READY   UP-TO-DATE   AVAILABLE   AGE
web    1/1     1            1           15s

[root@ek8s-master 1]# kubectl --as=system:serviceaccount:app-team:cicd-token get deployment -n app-team
Error from server (Forbidden): deployments.apps is forbidden: User "system:serviceaccount:app-team:cicd-token" cannot list resource "deployments" in API group "apps" in the namespace "app-team"
[root@ek8s-master 1]# kubectl get pod -n app-team
NAME                   READY   STATUS    RESTARTS   AGE
web-5bf684665b-w5hhf   1/1     Running   0          46s

##测试
[root@ek8s-master 1]# kubectl --as=system:serviceaccount:app-team:cicd-token get pod
Error from server (Forbidden): pods is forbidden: User "system:serviceaccount:app-team:cicd-token" cannot list resource "pods" in API group "" in the namespace "default"

https://kubernetes.io/zh-cn/docs/reference/access-authn-authz/authorization/#checking-api-access
##官网搜索关键词 can-i 可以找到格式
[root@ek8s-master 1]# kubectl auth can-i --as=system:serviceaccount:app-team:cicd-token create deployment -n app-team
yes
[root@ek8s-master 1]# kubectl auth can-i --as=system:serviceaccount:app-team:cicd-token create statefulset -n app-team
yes
[root@ek8s-master 1]# kubectl auth can-i --as=system:serviceaccount:app-team:cicd-token create daemonset -n app-team
yes
[root@ek8s-master 1]# kubectl auth can-i --as=system:serviceaccount:app-team:cicd-token get pod -n app-team
no
```

yaml:

```
# cat sa.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cicd-token
  namespace: app-team
---
# cat clusterrole.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  # "namespace" omitted since ClusterRoles are not namespaced
  name: deployment-clusterrole
rules:
- apiGroups: ["*"]  #注意这里，官网没有
  resources: ["deployments","statefulSets","daemonSets"]
  verbs: ["create"]

---
# cat rolebinding.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cicd-token-rolebinding
  namespace: app-team
subjects:
- kind: ServiceAccount
  name: cicd-token
  namespace: app-team
roleRef:
  kind: ClusterRole
  name: deployment-clusterrole
  apiGroup: rbac.authorization.k8s.io

```
## Day2-节点设置不可用

```
将名字为 ek8s-node-1 的节点设置为不可调度，同时驱逐运行在它上面的所有 Pods
```

```
#--> 切换到指定集群
# kubectl config use-context [NAME]
# kubectl cordon ek8s-node-1
# kubectl drain ek8s-node-1 --delete-emptydir-data --force --ignore-daemonsets
#--> 查看
kubectl get node

备注：
–force 不被控制器 (RC、RS、Job、DaemonSet 或 StatefulSet) 管理的pod也会被强制删除
–ignore-daemonsets 表示不会驱逐 daemonset 管理的 Pods
–delete-emptydir-data 如果 pods 使用 emptyDir，也会继续被删除

注：如果执行 drain 提示错误，根据提示再加上选项，例如--delete-local-data --force
```



## Day3- K8s 升级

[K8S升级](https://kubernetes.io/zh-cn/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

```
upgrade kubeadm
Upgrading kubeadm clusters | Kubernetes
```



```
给定运行版本1.22.1的现有Kubernetes集群，仅将主节点上的所有Kubernete控制平面和节点组件升级到版本1.22.2
您还需要在master节点上升级kubelet和kubectl。
确保drain主节点
在升级之前和升级后uncordon.
不要升级工作节点、etcd、容器管理器、CNI插件、DNS服务或任何其他插件
```

```
## 备注：要升级的集群中，只有一个 master 节点
#--> 切换到指定集群
kubectl config use-context [NAME]
#--> 查看当前集群的版本信息和要升级的节点名称
kubectl get node
#--> 登录到要升级的 master 节点
ssh master01
sudo su -
apt update && apt-cache madison kubeadm  #查看对应的版本，一样可以查kubectl和kubelet

apt-get update && apt-get install -y  kubeadm=1.22.2-00  #注意这里是“=”

如果异常可以添加参数：apt-get install -y --allow-change-held-packages kubeadm=1.22.2-00 #可以用man apt-get找到
#--> 检查 kubeadm 版本是否正确
kubeadm version
#--> 腾空控制面节点
kubectl drain master01 --force --delete-emptydir-data --ignore-daemonsets
#--> 查看可升级的版本信息
kubeadm upgrade plan 
#--> 控制面板升级，etcd 不进行升级
kubeadm upgrade apply v1.22.2  --etcd-upgrade=false  #可以kubeadm upgrade apply -h找到--etcd-upgrade参数
#--> 升级各个控制面节点上的 kubelet 和 kubectl 组件
apt-get update && apt-get install -y kubelet=1.22.2-00 kubectl=1.22.2-00 
#--> 重启 kubelet
systemctl daemon-reload && systemctl restart kubelet
#--> 取消对控制面节点的保护
kubeadm uncordon master01 
#--> 查看集群当前版本信息
kubectl get node
# kubectl version
# kubeadm version
# kubelet --version
```

```
##ubuntu
apt update
apt-cache madison kubeadm |grep 1.28.1
apt-get update && apt-get install -y --allow-change-held-packages kubeadm=1.25.1
kubeadm version
kubectl drain master --ignore-daemonsets --delete-local-data --force  #腾空控制面节点
sudo kubeadm upgrade plan  #命令查看可升级的版本信息
sudo kubeadm upgrade apply v1.25.1 --etcd-upgrade=false   #查看版本信息时，排除etcd
kubectl uncordon master
sudo kubeadm upgrade node  #命令查看控制面节点
apt-get update && apt-get install -y --allow-change-held-packages kubelet=1.25.1 kubectl=1.25.1
sudo systemctl daemon-reload
sudo systemctl restart kubelet
```



## Day4- etcd 备份与恢复

[为 Kubernetes 运行 etcd 集群 | Kubernetes](https://kubernetes.io/zh-cn/docs/tasks/administer-cluster/configure-upgrade-etcd/#restoring-an-etcd-cluster)

```
etcdctl
Operating etcd clusters for Kubernetes | Kubernetes
```



```
首先，创建运行于的现有etcd实例的快照https://127.0.0.1:2379，将快照保存到/var/lib/backup/etcd-snapshot.db
创建给定实例的快照预计将在几秒钟内完成。如果操作似乎挂起，那么您的命令可能有问题。使用CTRL+C取消操作，然后重试。
接下来，恢复位于/var/lib/backup/etcd-snapshot-previous.db的现有先前快照。数据库。
使用etcdctl连接到服务器时提供了以下TLS证书/密钥：

CA证书：/opt/KUIN0061/CA.crt
客户端证书：/opt/KUIN0061/etcd-client.crt
客户端密钥：/opt/KUIN0061/etcd-client.key
```

```
#快照etcd  对应的参数可以去看etcd.yaml确认
  
# ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/opt/KUIN00601/ca.crt --cert=/opt/KUIN00601/etcd-client.crt --key=/opt/KUIN00601/etcd-client.key snapshot save /var/lib/backup/etcd-snapshot.db

#恢复
# ETCDCTL_API=3 etcdctl snapshot restore --data-dir=<data-dir-location> snapshotdb  #官方

# systemctl stop etcd  #确认是systemctl拉起的etcd服务还是yaml，如果是yaml移除静态pod
# systemctl cat etcd # 确认下数据目录（--data-dir 值）
# mv /var/lib/etcd /var/lib/etcd.bak  #很重要

# ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/opt/KUIN00601/ca.crt  --cert=/opt/KUIN00601/etcd-client.crt --key=/opt/KUIN00601/etcd-client.key snapshot restore /var/lib/backup/etcd-snapshot-previous.db

# ETCDCTL_API=3 etcdctl snapshot restore --data-dir=/var/lib/backup/etcd /data/backup/etcd-snapshot-previous.db

# chown -R etcd:etcd /var/lib/etcd  #考试的时候要注意这个权限
# systemctl start etcd

##如果是yaml文件的，前面不需要移除目录文件也可以
# docker ps|grep etcd
# docker stop xxx && docker start XXX  #很重要

注：执行备份命令如果提示没证书文件，exit 退回上一步操作
```

## Day5-网络策略 

[网络策略 | Kubernetes](https://kubernetes.io/zh-cn/docs/concepts/services-networking/network-policies/#networkpolicy-resource)

```
networkpolicy
Network Policies | Kubernetes
```



```
在现有的namespace my-app中创建一个名为allow-port-from-namespace的新NetworkPolicy。
确保新的NetworkPolicy允许命名空间big-corp的能访问my-app的所有pod的8080端口。
进一步确保新的NetworkPolicy：

不允许对没有在监听端口8080的Pods的访问
不允许非来自 namespace big-corp中的Pods的访问
```

```
双重否定就是肯定，所以最后两句话的意思就是：
仅允许端口为 8080 的 pod 访问。
仅允许 big-corp命名空间中的 pod 访问。
```

```
kubectl config use-context hk8s
给命名空间打标签：kubectl label namespace big-corp name=big-corp
 
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-port-from-namespace
  namespace: my-app
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: big-corp
      ports:
        - protocol: TCP
          port: 8080
```

```
总结：
给命名空间打标签：kubectl label namespace myapp name=myapp
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-port-from-namespace
  namespace: big-corp
spec:
# podSelector: {}  #表示在big-corp的NS下所有pod
  podSelector:
    matchLabels:   #表示在big-corp的NS下，pod标签选择li=kai的pod
      li: kai
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: myapp   #表示允许NS中有name=myapp的标签内的资源才能访问
      ports:                #表示上述匹配中的pod只开放了8080端口给访问
        - protocol: TCP
          port: 8080

```



##  Day6-SVC暴露应用

官网搜索 service
 [服务（Service） | Kubernetes](https://kubernetes.io/zh-cn/docs/concepts/services-networking/service/#defining-a-service)

```
service
Service | Kubernetes
```



```
请重新配置现有的deployment:front-end以及添加名为http的端口规范来公开现有容器 nginx 的端口80/tcp。

创建一个名为front-end-svc的新服务，以公开容器端口http。

配置此服务，以通过在排定的节点上的 NodePort 来公开各个 Pods。
```

```
重新配置已经存在、名称为 front-end 的工作负载，为已经存在容器 nginx，添加一个名称为 http、暴露 80/tcp 的端口
创建一个名为 front-end-svc 的 svc，暴露容器的端口http
将其配置为 NodePort 类型的 svc
```

```
#如果没有deployment，用下面命令生成模板
# kubectl create deployment front-end --image=nginx:alpine --port=80  --dry-run=client -o yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: front-end
  name: front-end
spec:
  replicas: 1
  selector:
    matchLabels:
      app: front-end
  template:
    metadata:
      labels:
        app: front-end
    spec:
      containers:
      - image: nginx:alpine
        name: nginx
        ports:
        - name: http         #为自己提供服务的端口取个名称
          protocol: TCP
          containerPort: 80  #容器内本身提供服务端口

按照要求编辑 deployment 添加 ports 端口属性信息
kubectl edit deployment front-end
apiVersion: apps/v1
kind: Deployment
metadata:
  name: front-end
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec: 
      containers:
      - name: nginx
        image: nginx:1.14.2
        ports:
        - name: http
          containerPort: 80
          protocol: TCP

### --port=80 SVC服务端口80 会自动映射容器内部服务端口 --target-port=http 名称称为http的端口，也就是TCP 80
# kubectl expose deployment front-end --name=front-end-svc --port=80 --target-port=http --type=NodePort 

###直接用容器内服务端口--target-port=80
# kubectl expose deployment front-end --name=front-end-svc --port=80 --target-port=80 --type=NodePort 
```

## Day7-Ingress

[Ingress | Kubernetes](https://kubernetes.io/zh-cn/docs/concepts/services-networking/ingress/#the-ingress-resource)

```
ingress
Ingress | Kubernetes
```



```
Create a new nginx Ingress resources as follows:
Name: pone
Namespace: ing-internal
Exposing service hi on path /hello using service port 5678
The avaliability of service hello can be checked using the following command,which should return hello: curl -kL <INTERNAL_IP> /hello
```

```
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pone
  namespace: ing-internal
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - http:
      paths:
      - path: /hello
        pathType: Prefix
        backend:
          service:
            name: hi
            port:
              number: 5678
```



## Day8-扩容 Pod 数量

[Deployments | Kubernetes](https://kubernetes.io/zh-cn/docs/concepts/workloads/controllers/deployment/#scaling-a-deployment)

```
扩容名字为loadbalancer的deployment的副本数为5
```

```
# kubectl scale deployment loadbalancer --replicas=5

或者用$ kubectl edit deployment loadbalancer 直接在线扩容也可以
```



## Day9-nodeSelector

[将 Pod 分配给节点 | Kubernetes](https://kubernetes.io/zh-cn/docs/tasks/configure-pod-container/assign-pods-nodes/)

```
nodeSelector
Assigning Pods to Nodes | Kubernetes --->See Assign Pods to Nodes for more information

pod node
Assign Pods to Nodes | Kubernetes  #注意这里是Assign
```



```
Schedule a pod as follows:
name: nginx-kusc00401
Image: nginx
Node selector: disk=ssd
```

```
apiVersion: v1
kind: Pod
metadata:
  name: nginx-kusc00401
spec:
  containers:
  - name: nginx
    image: nginx
    imagePullPolicy: IfNotPresent
  nodeSelector:
    disk: ssd
```



## Day10-统计准备就绪节点数量

```
Check to see how many nodes are ready (not including nodes tained NoSchedule) and write the number to /opt/KUSC00402/kusc00402.txt
```

```
# kubectl describe node `kubectl get node|grep "Ready"|awk 'NR>1{print $1}'`|grep -i Taints|grep -v "NoSchedule"|wc -l > /opt/KUSC00402/kusc00402.txt
```



## Day11-Pod 配置多容器

```
Create a pod named kucc8 with a single app container for each of the following images runing inside(there may be between 1 and 4 images specified):nginx+memcached+redis
```

```
# kubectl run kucc8 --image=nginx --dry-run=client -o yaml > kucc8.yaml
# cat kucc8.yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    run: kucc8
  name: kucc8
spec:
  containers:
  - image: nginx
    name: nginx
  - image: redis
    name: redis
  - image: memcached
    name: memcached
```



## Day12-创建 PV

[配置 Pod 以使用 PersistentVolume 作为存储 | Kubernetes](https://kubernetes.io/zh-cn/docs/tasks/configure-pod-container/configure-persistent-volume-storage/#create-a-pv)

```
pv hostpath pod
Configure a Pod to Use a PersistentVolume for Storage
```



```
Create a persistent volume with name app-config, of capacity 1Gi and access mode ReadOnlyMany, the type of volume is hostPath and its location is /svc/app-config.
```

```
apiVersion: v1
kind: PersistentVolume
metadata:
  name: app-config
spec:
  capacity:
    storage: 1Gi
  accessModes:
    - ReadOnlyMany
  hostPath:
    path: "/svc/app-config"
    
storageClassName: manual   #可以去掉
```



## Day13-PVC-pod

[持久卷 | Kubernetes](https://kubernetes.io/zh-cn/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims)

[持久卷 | Kubernetes](https://kubernetes.io/zh-cn/docs/concepts/storage/persistent-volumes/#claims-as-volumes)

```
pv hostpath pod
Configure a Pod to Use a PersistentVolume for Storage

pvc pod
Persistent Volumes | Kubernetes   #有volumeMode: Filesystem
```



```
Create a new PersistentVolumeClaim:
Name: pv-volume
Class: csi-hostpath-sc
Capacity: 10Mi
Create a new Pod which mounts the PersistentVolumeClaim as a volume:
Name: web-server
Image: nginx
Mount Path: /usr/share/nginx/html
Configure the new Pod to have ReadWriteOnce access on the volume.
Finally,using kubectl edit or Kubectl patch expand the PersistentVolumeClaim to a capacity of 70Mi and record that change
```

```
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pv-volume
spec:
  accessModes:
    - ReadWriteOnce
  volumeMode: Filesystem      
  resources:
    requests:
      storage: 10Mi
  storageClassName: csi-hostpath-sc
  
---
apiVersion: v1
kind: Pod
metadata:
  name: web-server
spec:
  containers:
    - name: nginx
      image: nginx
      volumeMounts:
      - mountPath: "/usr/share/nginx/html"
        name: data-volume
  volumes:
    - name: data-volume
      persistentVolumeClaim:
        claimName: pv-volume

# kubectl edit pvc pv-volume -o yaml --save-config        #--save-config 参数可以通过kubectl edit -h 查找

```



## Day14-获取 Pod 错误日志 

```
Monitor the logs of pod bar and:
Extract log lines corresponding to error unable-to-access-website
Write them to /opt/KUTR00101/bar
```

```
# kubectl logs bar|grep "unable-to-access-website" >> /opt/KUTR00101/bar
```



## Day15-给Pod增加一个容器（边车）

[日志架构 | Kubernetes](https://kubernetes.io/zh-cn/docs/concepts/cluster-administration/logging/)

```
logging
Logging Architecture | Kubernetes
```



```
Without changing its existing containers, an existing Pod needs to be integrated into Kubernetes’s build-in logging architecture(e.g kubectl logs). Adding a streaming sidecar container is a good and common way to accomplish this requirement.
Task
Add a busybox sidecar container to the existing Pod big-corp-app.The new sidecar container has to run the following command:
/bin/sh -c tail -n+1 -f /var/log/big-corp-app.log
Use a volume mount named logs to make the file /var/log/big-corp-app.log available to the sidecar container.
Don’t modify the existing container.
Don’t modify the path of the log file, both containers must access it at /var/log/bin-corp-app.log
```

```
# cat legacy-app.yaml
apiVersion: v1
kind: Pod
metadata:
  name: legacy-app
spec:
  containers:
  - name: count
    image: busybox:1.28
    args:
    - /bin/sh
    - -c
    - >
      i=0;
      while true;
      do
        echo "$i: $(date)" >> /var/log/legacy-app.log;
        i=$((i+1));
        sleep 1;
      done
    volumeMounts:
    - name: varlog
      mountPath: /var/log
  - name: sidecar
    image: busybox:1.28.4
    command: ["/bin/sh", "-c", "tail -n+1 -f /var/log/legacy-app.log"]
#   args: [/bin/sh, -c , "tail -n+1 -f /var/log/legacy-app.log"]           #在这里command 和 args 命令等价    
    volumeMounts:
    - name: varlog
      mountPath: /var/log
  volumes:
  - name: varlog
    emptyDir: {}
```



## Day16-统计使用 CPU 最高的 Pod

```
From the pod label name=cpu-loader,find pods running high CPU workloads and write the name of the pod consuming most CPU to the file /opt/KUTR00401/KURT00401.txt (while alreay exists).
```

```
# kubectl top pod -l name=cpu-utilizer -A --sort-by=cpu|awk 'NR==2{print $2}' > /opt/KUTR00401/KURT00401.txt


# kubectl top -h 就可以看到相关参数
```



## Day17-节点 NotReady 处理

```
A kubernetes worker node, named wk8s-node-0 is in state NotReady.
Investigate why this is the case, and perform an appropriate steps to bring the node to a Ready stat, ensuring that any changes are made permanent
You can ssh to the failed node using:
— ssh wk8s-node-0
You can assume elevated privileges on the node with the following command:
— sudo -i
```

```
#--> 切换到指定集群
kubectl config use-context [NAME]
#--> 查看那个节点 notready
kubectl get node
kubectl get cs
#进到对应异常节点
ssh wk8s-node-0
sudo -i
## 查看 kubelet 服务是否正常运行
systemctl status kubelet
## 如果状态不是running，启动 kubelet 服务
systemctl restart kubelet
## 设置 kubelet 服务开机启动
systemctl enable kubelet
##检查
kubectl get node 
```





### 可参考url
```
##真题
https://blog.csdn.net/qq_35583325/article/details/126739295?spm=1001.2101.3001.6650.10&utm_medium=distribute.pc_relevant.none-task-blog-2%7Edefault%7EOPENSEARCH%7ERate-10-126739295-blog-124554634.pc_relevant_aa2&depth_1-utm_source=distribute.pc_relevant.none-task-blog-2%7Edefault%7EOPENSEARCH%7ERate-10-126739295-blog-124554634.pc_relevant_aa2&utm_relevant_index=19

https://blog.csdn.net/weixin_72758284/article/details/128142352?spm=1001.2101.3001.6650.12&utm_medium=distribute.pc_relevant.none-task-blog-2%7Edefault%7EOPENSEARCH%7ERate-12-128142352-blog-124554634.pc_relevant_aa2&depth_1-utm_source=distribute.pc_relevant.none-task-blog-2%7Edefault%7EOPENSEARCH%7ERate-12-128142352-blog-124554634.pc_relevant_aa2&utm_relevant_index=21

https://blog.csdn.net/weixin_39246554/article/details/126874141?spm=1001.2014.3001.5502

https://blog.csdn.net/zhouwenjun0820/article/details/105881669
```
### K8S部署
```
https://blog.csdn.net/weixin_39246554/article/details/127336350?spm=1001.2014.3001.5502
```


